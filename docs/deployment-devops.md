# Advanced Deployment & DevOps Guide

## 🚀 Infrastructure as Code with Terraform

### Multi-Environment Infrastructure

```hcl
# main.tf - Main infrastructure configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }

  backend "s3" {
    bucket         = "agri-tracking-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-lock-table"
  }
}

# Provider configurations
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Agricultural Produce Tracking"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

# VPC and Networking
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"

  name = "agri-tracking-${var.environment}"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment == "development"
  enable_dns_hostnames   = true
  enable_dns_support     = true

  tags = {
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }

  public_subnet_tags = {
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
    "kubernetes.io/role/elb"                      = "1"
  }

  private_subnet_tags = {
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
    "kubernetes.io/role/internal-elb"             = "1"
  }
}

# EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = local.cluster_name
  cluster_version = "1.28"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # EKS Managed Node Group
  eks_managed_node_groups = {
    general = {
      desired_size = var.environment == "production" ? 3 : 2
      min_size     = 1
      max_size     = var.environment == "production" ? 10 : 5

      instance_types = ["t3.medium"]
      capacity_type  = "ON_DEMAND"

      tags = {
        Environment = var.environment
        Team        = "platform"
      }
    }

    # GPU nodes for ML workloads
    ml = {
      desired_size = var.environment == "production" ? 1 : 0
      min_size     = 0
      max_size     = 3

      instance_types = ["g4dn.xlarge"]
      capacity_type  = "SPOT"

      taints = [{
        key    = "dedicated"
        value  = "ml"
        effect = "NO_SCHEDULE"
      }]

      tags = {
        Environment = var.environment
        Workload    = "machine-learning"
      }
    }
  }

  # Fargate Profile for serverless workloads
  fargate_profiles = {
    default = {
      name = "default"
      selectors = [
        {
          namespace = "kube-system"
        },
        {
          namespace = "default"
        }
      ]
    }
  }

  # Cluster add-ons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }

  # IRSA - IAM Roles for Service Accounts
  enable_irsa = true

  tags = {
    Environment = var.environment
  }
}

# RDS PostgreSQL Database
module "db" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = "agri-tracking-${var.environment}"

  engine               = "postgres"
  engine_version       = "15.4"
  family               = "postgres15"
  major_engine_version = "15"
  instance_class       = var.environment == "production" ? "db.r6g.large" : "db.t4g.medium"

  allocated_storage     = var.environment == "production" ? 100 : 20
  max_allocated_storage = var.environment == "production" ? 1000 : 100

  db_name  = "agritracking"
  username = var.db_username
  password = var.db_password
  port     = 5432

  multi_az               = var.environment == "production"
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [module.security_group.security_group_id]

  maintenance_window              = "Mon:00:00-Mon:03:00"
  backup_window                  = "03:00-06:00"
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  create_cloudwatch_log_group     = true

  backup_retention_period = var.environment == "production" ? 30 : 7
  skip_final_snapshot     = var.environment != "production"
  deletion_protection     = var.environment == "production"

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  create_monitoring_role                = true
  monitoring_interval                   = 60

  parameters = [
    {
      name  = "autovacuum"
      value = "1"
    },
    {
      name  = "client_encoding"
      value = "utf8"
    }
  ]
}

# ElastiCache Redis
module "redis" {
  source = "terraform-aws-modules/elasticache/aws"

  cluster_id               = "agri-tracking-${var.environment}"
  create_cluster           = true
  engine                   = "redis"
  node_type                = var.environment == "production" ? "cache.r6g.large" : "cache.t4g.micro"
  num_cache_nodes          = var.environment == "production" ? 2 : 1
  parameter_group_name     = "default.redis7"
  port                     = 6379
  maintenance_window       = "mon:03:00-mon:04:00"
  snapshot_window          = "04:00-05:00"
  snapshot_retention_limit = var.environment == "production" ? 7 : 1

  subnet_ids = module.vpc.private_subnets
  security_group_ids = [module.security_group.security_group_id]
}

# Application Load Balancer
module "alb" {
  source  = "terraform-aws-modules/alb/aws"
  version = "~> 8.0"

  name = "agri-tracking-${var.environment}"

  load_balancer_type = "application"

  vpc_id          = module.vpc.vpc_id
  subnets         = module.vpc.public_subnets
  security_groups = [module.security_group.security_group_id]

  target_groups = [
    {
      name             = "api"
      backend_protocol = "HTTP"
      backend_port     = 80
      target_type      = "ip"

      health_check = {
        enabled             = true
        interval            = 30
        path                = "/health"
        port                = "traffic-port"
        healthy_threshold   = 3
        unhealthy_threshold = 3
        timeout             = 6
        protocol            = "HTTP"
        matcher             = "200-399"
      }
    },
    {
      name             = "frontend"
      backend_protocol = "HTTP"
      backend_port     = 80
      target_type      = "ip"

      health_check = {
        enabled             = true
        interval            = 30
        path                = "/"
        port                = "traffic-port"
        healthy_threshold   = 3
        unhealthy_threshold = 3
        timeout             = 6
        protocol            = "HTTP"
        matcher             = "200-399"
      }
    }
  ]

  http_tcp_listeners = [
    {
      port               = 80
      protocol           = "HTTP"
      target_group_index = 0
    }
  ]

  https_listeners = [
    {
      port               = 443
      protocol           = "HTTPS"
      certificate_arn    = module.acm.acm_certificate_arn
      target_group_index = 0
    }
  ]

  tags = {
    Environment = var.environment
  }
}

# CloudFront CDN
module "cloudfront" {
  source  = "terraform-aws-modules/cloudfront/aws"
  version = "~> 3.0"

  aliases = [var.domain_name]

  comment             = "Agricultural Produce Tracking CDN"
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  retain_on_delete    = false
  wait_for_deployment = false

  create_origin_access_identity = true
  origin_access_identities = {
    s3_bucket_one = "Agricultural Produce Tracking S3"
  }

  origin = {
    s3_one = {
      domain_name = module.s3_one.s3_bucket_bucket_regional_domain_name
      s3_origin_config = {
        origin_access_identity = "s3_bucket_one"
      }
    }

    alb = {
      domain_name = module.alb.lb_dns_name
      custom_origin_config = {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior = {
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]
    compress        = true
    query_string    = true

    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingEnabled
  }

  ordered_cache_behavior = [
    {
      path_pattern           = "/api/*"
      target_origin_id       = "alb"
      viewer_protocol_policy = "https-only"

      allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods  = ["GET", "HEAD"]
      compress        = true
      query_string    = true

      cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    }
  ]
}

# Monitoring with Prometheus and Grafana
module "monitoring" {
  source  = "terraform-aws-modules/eks/aws//modules/prometheus"
  version = "~> 19.0"

  cluster_name = module.eks.cluster_name

  prometheus = {
    service_account_name = "prometheus"
    namespace            = "monitoring"
  }

  grafana = {
    service_account_name = "grafana"
    namespace            = "monitoring"
    admin_password       = var.grafana_admin_password
  }

  alertmanager = {
    service_account_name = "alertmanager"
    namespace            = "monitoring"
  }
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "development"
}

variable "db_username" {
  description = "Database username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
}

variable "grafana_admin_password" {
  description = "Grafana admin password"
  type        = string
  sensitive   = true
}

# Outputs
output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "database_endpoint" {
  description = "Database endpoint"
  value       = module.db.db_instance_endpoint
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.redis.elasticache_replication_group_primary_endpoint_address
}

output "alb_dns_name" {
  description = "Load balancer DNS name"
  value       = module.alb.lb_dns_name
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = module.cloudfront.cloudfront_distribution_domain_name
}
```

## 🐳 Kubernetes Manifests with Helm

### Helm Chart Structure

```
charts/
├── agri-tracking/
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── templates/
│   │   ├── _helpers.tpl
│   │   ├── configmap.yaml
│   │   ├── secret.yaml
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── ingress.yaml
│   │   ├── hpa.yaml
│   │   ├── pdb.yaml
│   │   ├── networkpolicy.yaml
│   │   └── servicemonitor.yaml
│   └── charts/
│       ├── postgresql/
│       ├── redis/
│       └── elasticsearch/
```

### Main Application Deployment

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "agri-tracking.fullname" . }}
  labels:
    {{- include "agri-tracking.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "agri-tracking.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
      labels:
        {{- include "agri-tracking.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "agri-tracking.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
        - name: {{ .Chart.Name }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          env:
            - name: NODE_ENV
              value: {{ .Values.environment }}
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "agri-tracking.fullname" . }}
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "agri-tracking.fullname" . }}
                  key: redis-url
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: {{ include "agri-tracking.fullname" . }}
                  key: jwt-secret
            - name: ETHEREUM_RPC_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "agri-tracking.fullname" . }}
                  key: ethereum-rpc-url
          envFrom:
            - configMapRef:
                name: {{ include "agri-tracking.fullname" . }}
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            - name: tmp-volume
              mountPath: /tmp
            - name: cache-volume
              mountPath: /app/cache
      volumes:
        - name: tmp-volume
          emptyDir: {}
        - name: cache-volume
          emptyDir: {}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

### Service Mesh with Istio

```yaml
# templates/networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "agri-tracking.fullname" . }}
  labels:
    {{- include "agri-tracking.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      {{- include "agri-tracking.selectorLabels" . | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: istio-ingressgateway
      ports:
        - protocol: TCP
          port: http
        - protocol: TCP
          port: https
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: prometheus
      ports:
        - protocol: TCP
          port: metrics
  egress:
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: postgresql
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: redis
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: elasticsearch
      ports:
        - protocol: TCP
          port: 5432
        - protocol: TCP
          port: 6379
        - protocol: TCP
          port: 9200
    - to: []
      ports:
        - protocol: TCP
          port: 53
        - protocol: UDP
          port: 53
```

### Horizontal Pod Autoscaler

```yaml
# templates/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "agri-tracking.fullname" . }}
  labels:
    {{- include "agri-tracking.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "agri-tracking.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    {{- end }}
    {{- if .Values.autoscaling.targetMemoryUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
    {{- end }}
    {{- if .Values.autoscaling.customMetrics }}
    {{- toYaml .Values.autoscaling.customMetrics | nindent 4 }}
    {{- end }}
```

### Pod Disruption Budget

```yaml
# templates/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "agri-tracking.fullname" . }}
  labels:
    {{- include "agri-tracking.labels" . | nindent 4 }}
spec:
  minAvailable: {{ .Values.podDisruptionBudget.minAvailable | default 1 }}
  selector:
    matchLabels:
      {{- include "agri-tracking.selectorLabels" . | nindent 6 }}
```

## 🔄 CI/CD Pipeline with GitHub Actions

### Advanced CI/CD Workflow

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # Security Scanning
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

  # Code Quality
  code-quality:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run Prettier
        run: npm run format:check

      - name: Run TypeScript type check
        run: npm run type-check

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  # Build and Push Docker Images
  build-and-push:
    needs: [security-scan, code-quality]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        service: [api, frontend, mobile-api]
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/${{ matrix.service }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./docker/${{ matrix.service }}/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # Infrastructure Tests
  infrastructure-test:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Terraform Format
        run: terraform fmt -check

      - name: Terraform Validate
        run: terraform validate

      - name: Terraform Plan
        run: terraform plan -no-color
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

  # Deploy to Development
  deploy-dev:
    needs: [build-and-push, infrastructure-test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment: development
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy to Development
        run: |
          aws eks update-kubeconfig --region us-east-1 --name agri-tracking-dev
          helm upgrade --install agri-tracking-dev ./charts/agri-tracking \
            --namespace development \
            --set image.tag=${{ github.sha }} \
            --set environment=development \
            --wait

  # Deploy to Staging
  deploy-staging:
    needs: deploy-dev
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: staging
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Run Integration Tests
        run: |
          aws eks update-kubeconfig --region us-east-1 --name agri-tracking-staging
          npm run test:integration

      - name: Deploy to Staging
        run: |
          helm upgrade --install agri-tracking-staging ./charts/agri-tracking \
            --namespace staging \
            --set image.tag=${{ github.sha }} \
            --set environment=staging \
            --wait

      - name: Run E2E Tests
        run: |
          npm run test:e2e

  # Deploy to Production
  deploy-prod:
    needs: deploy-staging
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy to Production (Blue-Green)
        run: |
          aws eks update-kubeconfig --region us-east-1 --name agri-tracking-prod

          # Get current active deployment
          CURRENT_COLOR=$(kubectl get svc agri-tracking -n production -o jsonpath='{.spec.selector.color}')

          # Determine next color
          if [ "$CURRENT_COLOR" = "blue" ]; then
            NEXT_COLOR="green"
          else
            NEXT_COLOR="blue"
          fi

          # Deploy to next color
          helm upgrade --install agri-tracking-$NEXT_COLOR ./charts/agri-tracking \
            --namespace production \
            --set image.tag=${{ github.sha }} \
            --set environment=production \
            --set color=$NEXT_COLOR \
            --wait

          # Run smoke tests
          npm run test:smoke

          # Switch traffic
          kubectl patch svc agri-tracking -n production -p "{\"spec\":{\"selector\":{\"color\":\"$NEXT_COLOR\"}}}"

          # Wait for traffic to switch
          sleep 60

          # Run post-deployment tests
          npm run test:post-deployment

          # Scale down old deployment
          kubectl scale deployment agri-tracking-$CURRENT_COLOR --replicas=0 -n production

  # Rollback
  rollback:
    runs-on: ubuntu-latest
    if: failure() && (needs.deploy-prod.result == 'failure' || needs.deploy-staging.result == 'failure')
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Rollback Deployment
        run: |
          # Rollback logic here
          echo "Rolling back deployment..."

  # Notification
  notify:
    needs: [deploy-prod, rollback]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Notify Slack
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: "Deployment ${{ job.status == 'success' && 'successful' || 'failed' }}"
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## 📊 Monitoring and Observability

### Prometheus Metrics

```yaml
# ServiceMonitor for Prometheus
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "agri-tracking.fullname" . }}
  labels:
    {{- include "agri-tracking.labels" . | nindent 4 }}
spec:
  selector:
    matchLabels:
      {{- include "agri-tracking.selectorLabels" . | nindent 6 }}
  endpoints:
    - port: metrics
      path: /metrics
      interval: 30s
      scrapeTimeout: 10s
```

### Application Metrics

```typescript
// Prometheus metrics integration
import { collectDefaultMetrics, register, Gauge, Counter, Histogram } from 'prom-client';

// Collect default metrics
collectDefaultMetrics();

// Custom metrics
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

const produceRegistrations = new Counter({
  name: 'produce_registrations_total',
  help: 'Total number of produce registrations',
  labelNames: ['farmer_id', 'quality']
});

const blockchainTransactions = new Counter({
  name: 'blockchain_transactions_total',
  help: 'Total number of blockchain transactions',
  labelNames: ['type', 'status']
});

// Middleware for collecting metrics
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  activeConnections.inc();

  res.on('finish', () => {
    activeConnections.dec();
    const duration = (Date.now() - start) / 1000;

    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);
  });

  next();
}

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end();
  }
});

// Business metrics collection
export class MetricsCollector {
  static recordProduceRegistration(farmerId: string, quality: string): void {
    produceRegistrations.labels(farmerId, quality).inc();
  }

  static recordBlockchainTransaction(type: string, status: string): void {
    blockchainTransactions.labels(type, status).inc();
  }

  static updateActiveConnections(count: number): void {
    activeConnections.set(count);
  }
}
```

### Grafana Dashboards

```json
{
  "dashboard": {
    "title": "Agricultural Produce Tracking",
    "tags": ["agriculture", "blockchain"],
    "timezone": "browser",
    "panels": [
      {
        "title": "HTTP Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Active Connections",
        "type": "singlestat",
        "targets": [
          {
            "expr": "active_connections",
            "legendFormat": "Active Connections"
          }
        ]
      },
      {
        "title": "Produce Registrations",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(produce_registrations_total[5m])",
            "legendFormat": "{{farmer_id}} - {{quality}}"
          }
        ]
      },
      {
        "title": "Blockchain Transaction Success Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(blockchain_transactions_total{status=\"success\"}[5m]) / rate(blockchain_transactions_total[5m]) * 100",
            "legendFormat": "Success Rate %"
          }
        ]
      }
    ]
  }
}
```

## 🔐 Security Implementation

### Secrets Management

```yaml
# External Secrets Operator
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ include "agri-tracking.fullname" . }}
spec:
  refreshInterval: 15s
  secretStoreRef:
    name: aws-secretsmanager
    kind: SecretStore
  target:
    name: {{ include "agri-tracking.fullname" . }}
    creationPolicy: Owner
  data:
    - secretKey: database-url
      remoteRef:
        key: prod/agri-tracking/database-url
    - secretKey: jwt-secret
      remoteRef:
        key: prod/agri-tracking/jwt-secret
    - secretKey: ethereum-private-key
      remoteRef:
        key: prod/agri-tracking/ethereum-private-key
    - secretKey: api-keys
      remoteRef:
        key: prod/agri-tracking/api-keys
```

### Network Policies

```yaml
# Comprehensive network policies
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "agri-tracking.fullname" . }}-strict
spec:
  podSelector:
    matchLabels:
      app: {{ include "agri-tracking.name" . }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
        - podSelector:
            matchLabels:
              app: istio-ingressgateway
      ports:
        - protocol: TCP
          port: 8080
    - from:
        - podSelector:
            matchLabels:
              app: prometheus
      ports:
        - protocol: TCP
          port: 9090
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgresql
        - podSelector:
            matchLabels:
              app: redis
        - podSelector:
            matchLabels:
              app: elasticsearch
      ports:
        - protocol: TCP
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8
              - 172.16.0.0/12
              - 192.168.0.0/16
      ports:
        - protocol: TCP
          port: 443
```

## 🚀 Performance Optimization

### Database Optimization

```sql
-- Optimized indexes for common queries
CREATE INDEX CONCURRENTLY idx_produces_farmer_id ON produces(farmer_id);
CREATE INDEX CONCURRENTLY idx_produces_status ON produces(status);
CREATE INDEX CONCURRENTLY idx_produces_created_at ON produces(created_at DESC);
CREATE INDEX CONCURRENTLY idx_transfers_produce_id ON transfers(produce_id);
CREATE INDEX CONCURRENTLY idx_price_history_produce_id ON price_history(produce_id);

-- Partitioning for large tables
CREATE TABLE produces_y2024m01 PARTITION OF produces
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Materialized view for analytics
CREATE MATERIALIZED VIEW farmer_stats AS
SELECT
    farmer_id,
    COUNT(*) as total_produces,
    AVG(current_price) as avg_price,
    MAX(created_at) as last_registration
FROM produces
WHERE status = 'ACTIVE'
GROUP BY farmer_id;

-- Refresh materialized view
CREATE OR REPLACE FUNCTION refresh_farmer_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY farmer_stats;
END;
$$ LANGUAGE plpgsql;

-- Automated refresh every hour
SELECT cron.schedule('refresh-farmer-stats', '0 * * * *', 'SELECT refresh_farmer_stats();');
```

### Caching Strategy

```typescript
// Advanced caching with Redis
export class AdvancedCache {
  constructor(private readonly redis: Redis) {}

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 3600,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try L1 cache (application cache)
    const l1Key = `l1:${key}`;
    let data = await this.redis.get(l1Key);

    if (data) {
      return JSON.parse(data);
    }

    // Try L2 cache (distributed cache)
    const l2Key = `l2:${key}`;
    data = await this.redis.get(l2Key);

    if (data) {
      // Populate L1 cache
      await this.redis.setex(l1Key, 300, data); // 5 minutes
      return JSON.parse(data);
    }

    // Fetch from source
    const result = await fetcher();

    // Cache the result
    const serialized = JSON.stringify(result);
    await Promise.all([
      this.redis.setex(l1Key, 300, serialized),
      this.redis.setex(l2Key, ttl, serialized)
    ]);

    // Publish cache update event
    await this.redis.publish('cache:updated', JSON.stringify({ key, ttl }));

    return result;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      await this.redis.publish('cache:invalidated', JSON.stringify({ pattern, keys }));
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    const info = await this.redis.info('stats');
    const hits = parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] || '0');
    const misses = parseInt(info.match(/keyspace_misses:(\d+)/)?.[1] || '0');

    return {
      hitRate: hits / (hits + misses),
      totalKeys: await this.redis.dbsize(),
      memoryUsage: await this.redis.memory('stats')
    };
  }
}
```

This comprehensive deployment and DevOps guide provides enterprise-grade infrastructure setup, CI/CD pipelines, monitoring, security, and performance optimization strategies for the advanced agricultural produce tracking system.