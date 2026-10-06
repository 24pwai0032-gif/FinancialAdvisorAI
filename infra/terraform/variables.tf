variable "region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment (prod, staging, dev)."
  default     = "prod"
}

variable "name" {
  type        = string
  description = "Resource name prefix."
  default     = "moneywealth"
}

# ── Networking ──────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "az_count" {
  type        = number
  description = "Number of AZs to span (>=2 for HA)."
  default     = 2
}

# ── Backend container ───────────────────────────────────────────────────────
variable "container_image" {
  type        = string
  description = "Full ECR image URI:tag for the API. Overwritten by CI per deploy."
  default     = ""
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "task_cpu" {
  type    = number
  default = 512
}

variable "task_memory" {
  type    = number
  default = 1024
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "min_capacity" {
  type    = number
  default = 2
}

variable "max_capacity" {
  type    = number
  default = 10
}

# ── Database ────────────────────────────────────────────────────────────────
variable "db_name" {
  type    = string
  default = "financial_advisor"
}

variable "db_master_username" {
  type    = string
  default = "mwadmin"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  type        = bool
  description = "Enable RDS Multi-AZ standby (required for production HA)."
  default     = true
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

# ── TLS / DNS ───────────────────────────────────────────────────────────────
variable "acm_certificate_arn" {
  type        = string
  description = "ACM cert ARN for the ALB HTTPS listener. Empty = HTTP only (dev)."
  default     = ""
}

variable "web_app_url" {
  type        = string
  description = "Public URL of the frontend (for email/redirect links + CORS)."
  default     = "https://moneywealth-chi.vercel.app"
}

variable "alert_email" {
  type        = string
  description = "Email subscribed to CloudWatch alarm notifications."
  default     = ""
}

# Secret parameter names managed in SSM (values set out-of-band, never in TF).
variable "secret_names" {
  type = list(string)
  default = [
    "DATABASE_URL", "MIGRATION_DATABASE_URL", "REDIS_URL",
    "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "PLAID_ENC_KEY",
    "PLAID_CLIENT_ID", "PLAID_SECRET", "GROQ_API_KEY",
  ]
}
