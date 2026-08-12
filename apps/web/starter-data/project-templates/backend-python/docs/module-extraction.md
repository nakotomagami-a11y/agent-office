# Module extraction

When (if) a module needs to become its own service.

## When to extract

Real signals:
- Different scaling profile (10x traffic, 10x CPU)
- Different SLO (strict latency vs batch)
- A second team owns it
- Different infrastructure (GPU access)

NOT signals:
- "It feels big"
- "We might need it later"
- "Microservices are best practice"

## The recipe

Assume `billing` is being extracted.

### 1. Define the HTTP contract

Look at every `from app.modules.billing import ...` across the codebase. Those are the public functions.

```
get_invoice(session, id)        → GET /billing/invoices/{id}
create_invoice(session, data)   → POST /billing/invoices
list_invoices(session, user_id) → GET /billing/users/{user_id}/invoices
```

Use the same Pydantic schemas - copy to the new service.

### 2. Build the new service

New repo from `backend-python` template. Copy `billing` module as the only domain module. Wire up routes.

New service has its own DB. Billing's tables move with it.

If billing needs user data, it calls the original service over HTTP.

### 3. Swap the client

Replace `app/modules/billing/__init__.py` with an HTTP client:

```python
# app/modules/billing/__init__.py (after extraction)
import httpx
from app.shared.config import config
from .schemas import Invoice, NewInvoice

_client = httpx.AsyncClient(
    base_url=config.BILLING_SERVICE_URL,
    headers={"X-Service-Token": config.BILLING_SERVICE_TOKEN},
    timeout=10.0,
)

async def get_invoice(invoice_id: str) -> Invoice:
    r = await _client.get(f"/billing/invoices/{invoice_id}")
    r.raise_for_status()
    return Invoice.model_validate(r.json())

# ... etc
```

Existing callers (`from app.modules.billing import get_invoice`) keep working unchanged.

### 4. Migrate data

- Stop writes to old billing tables
- Snapshot, ship to new service
- Resume writes (now hitting new service)
- Drop old tables after a safety window

### 5. Delete old code

Remove `app/modules/billing/_internal/`, `service.py`, `repository.py`, `models.py`. Keep `__init__.py` as the HTTP client.

## What you GAIN

- Independent deploys, scaling, infra

## What you LOSE

- Network reliability
- Distributed transactions
- Local-dev simplicity
- Refactor speed (function changes are now versioned HTTP changes)

Real costs. Don't extract unless benefits clearly exceed them.

## What NOT to do

- Don't extract speculatively
- Don't share databases across services
- Don't treat extraction as the default - modular monolith is
- Don't keep the original tables in the original DB after migration
