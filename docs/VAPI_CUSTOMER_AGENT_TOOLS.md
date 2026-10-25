# VAPI_CUSTOMER_AGENT_TOOLS.md

## Data Udipi Customer Voice Agent — Vapi Dashboard Configuration

> **Security Note:** This document contains NO private keys, secrets,
> Razorpay credentials, or database credentials. It is safe to commit.

---

## Overview

The Data Udipi Customer Voice Agent is a **Vapi** assistant embedded in the
mobile app. It is a **UI Orchestrator + Read-Only Data Assistant**.

```
Customer Speech
     │
     ▼
  Vapi ASR (Speech-to-Text)
     │
     ▼
  Vapi LLM (Claude Sonnet or similar)
     │ uses tools ↓
     ├─ Frontend actions → vapiStore.handleVapiToolCall()
     │                   → mobileAgentActionDispatcher.ts
     │                   → Expo Router / Zustand cart
     │
     └─ Backend reads   → vapiStore.fetchAgentData()
                        → POST /api/v1/public/mcp/mobile-agent-tool
                        → FastAPI → existing models → PostgreSQL READ
                        → JSON → spoken response
     │
     ▼
  Vapi TTS (Text-to-Speech) → Customer hears response
```

---

## Vapi Dashboard Settings

### Assistant Name
```
Data Udipi Customer Assistant
```

### First Message (Initial Greeting — one of the following, randomly selected)
```
Vanakkam! Welcome to Data Udipi Veg Restaurant. I am your dining assistant. How may I help you today?
```

> **Important:** The first message handles the greeting. The system prompt
> instructs the LLM NOT to greet again after navigation.

### Voice
Recommended: `11Labs` provider, a warm, clear Indian-English accent voice.
Fallback: Any natural-sounding female or male voice from the provider.

### Model
- Provider: `Anthropic`
- Model: `claude-sonnet-4-5` or `claude-3-5-sonnet-20241022`
- Max tokens: `1000`
- Temperature: `0.3`

### Background Sound
- `off` (restaurant ambient is real; don't add artificial background)

### End-of-Call Message
```
Thank you for dining with Data Udipi. Have a wonderful day!
```

---

## System Prompt Location

The system prompt is maintained in:
```
Food_Ordering_App_Backend/app/prompts/mobile_customer_agent.py
→ MOBILE_CUSTOMER_AGENT_PROMPT
```

Copy the full content of `MOBILE_CUSTOMER_AGENT_PROMPT` into the Vapi
Dashboard → Assistant → System Prompt field.

---

## Tools Registry

The following tools must be registered in the Vapi Dashboard.
Each tool is a **function** that Vapi calls during conversation.

---

### 1. `app_navigate`

**Purpose:** Navigate to a specific screen in the app.

**Frontend/Backend:** Frontend (Expo Router)

**Parameters:**
| Parameter | Type   | Required | Description                                    |
|-----------|--------|----------|------------------------------------------------|
| route     | string | Yes      | The target screen route (see routes below)     |
| params    | object | No       | Optional query params to pass to the screen    |

**Supported routes:**
```
/home
/menu
/profile
/rewards
/favourites
/(order)/orders
/(order)/order-details
/(order)/track-order
/(order)/delivery-tracking
/(checkout)/checkout
/(checkout)/delivery-checkout
/(checkout)/payment
/(checkout)/invoice
/(address)/my-addresses
/(address)/add-address
/outlet-selector
/(main)/bulk-catering
/(main)/catering-choose-package
/(main)/catering-event-details
/(main)/catering-customise-menu
/(main)/catering-add-extras
/(main)/catering-review-quote
/(main)/catering-advance-payment
/(main)/catering-balance-payment
/(main)/catering-order-details
/login
/signup
```

**Example call:**
```json
{
  "route": "/profile"
}
```

**Expected result:**
```json
{ "success": true, "action": "navigate", "message": "Navigated to /profile", "data": { "route": "/profile" } }
```

---

### 2. `app_go_back`

**Purpose:** Navigate to the previous screen.

**Frontend/Backend:** Frontend

**Parameters:** None

**Example call:** `{}`

**Expected result:**
```json
{ "success": true, "action": "go_back", "message": "Went back." }
```

---

### 3. `app_get_context`

**Purpose:** Get the current app state — authentication, cart, restaurant, live order, dine-in session.

**Frontend/Backend:** Frontend (reads Zustand stores)

**Parameters:** None

**Example call:** `{}`

**Expected result:**
```json
{
  "success": true,
  "context": {
    "auth": {
      "isAuthenticated": true,
      "customerId": 42,
      "customerName": "Sriraam",
      "phone": "9876543210"
    },
    "restaurant": {
      "selectedOutletId": 1,
      "selectedOutletName": "Data Udipi - Main Branch"
    },
    "cart": {
      "orderType": "Take Away",
      "itemCount": 2,
      "subtotal": 200,
      "tableNumber": "",
      "items": [
        { "id": 5, "name": "Masala Dosa", "quantity": 2, "price": 100 }
      ]
    },
    "liveOrder": {
      "hasActiveOrder": false,
      "orderType": null,
      "orderId": null,
      "dbOrderId": null,
      "status": null
    },
    "dineIn": {
      "isActive": false,
      "tableNumber": null,
      "activeOrderId": null,
      "totalAmount": 0,
      "itemCount": 0
    }
  }
}
```

---

### 4. `set_order_type`

**Purpose:** Set the ordering mode: Dine In, Take Away, or Delivery.

**Frontend/Backend:** Frontend (Zustand cart store)

**Parameters:**
| Parameter  | Type   | Required | Description                                   |
|------------|--------|----------|-----------------------------------------------|
| order_type | string | Yes      | One of: "Dine In", "Take Away", "Delivery"   |

**Accepted variations** (normalized internally):
- "takeaway", "take away", "take-away", "takeout" → `Take Away`
- "dine in", "dinein", "dine-in", "table" → `Dine In`
- "delivery", "deliver", "home delivery" → `Delivery`

**Example call:**
```json
{ "order_type": "Take Away" }
```

**Expected result:**
```json
{ "success": true, "action": "set_order_type", "message": "Order type set to Take Away", "data": { "orderType": "Take Away" } }
```

---

### 5. `menu_search`

**Purpose:** Search real menu items by name or category. Always call this before adding items to cart.

**Frontend/Backend:** Backend (PostgreSQL read)

**Parameters:**
| Parameter     | Type   | Required | Description                                     |
|---------------|--------|----------|-------------------------------------------------|
| query         | string | No       | Text to search in item names/descriptions       |
| category_name | string | No       | Filter by category name (e.g. "Breakfast")      |

**Example call:**
```json
{ "query": "masala dosa" }
```

**Expected result:**
```json
{
  "success": true,
  "menu_items": [
    {
      "id": 5,
      "name": "Masala Dosa",
      "price": 100.0,
      "description": "Crispy dosa with spiced potato filling",
      "is_available": true,
      "category_id": 2
    }
  ],
  "count": 1
}
```

> **Critical:** The `id` from this result must be used as `item_id` in `cart_update`.
> Never invent item IDs.

---

### 6. `cart_update`

**Purpose:** Add, remove, or adjust items in the frontend cart.

**Frontend/Backend:** Frontend (Zustand cart store)

**Parameters:**
| Parameter   | Type    | Required | Description                                               |
|-------------|---------|----------|-----------------------------------------------------------|
| sub_action  | string  | Yes      | One of: add, remove, increment, decrement, set_quantity, clear, show |
| item_id     | integer | Cond.    | Required for: add, remove, increment, decrement, set_quantity       |
| quantity    | integer | Cond.    | Required for: add, set_quantity                                     |
| item        | object  | Cond.    | Required for: add — must contain id, name, price, category         |

**`item` object schema (for add):**
```json
{
  "id": 5,
  "name": "Masala Dosa",
  "price": 100.0,
  "image": "",
  "category": "Breakfast",
  "desc": "Crispy dosa with spiced potato filling"
}
```

> **Always call `menu_search` first** to get the real item ID, name, and price.
> Never fabricate the item object.

**Example — Add 2 Masala Dosa:**
```json
{
  "sub_action": "add",
  "item_id": 5,
  "quantity": 2,
  "item": {
    "id": 5,
    "name": "Masala Dosa",
    "price": 100.0,
    "image": "",
    "category": "Breakfast",
    "desc": "Crispy dosa with spiced potato filling"
  }
}
```

**Example — Remove item:**
```json
{ "sub_action": "remove", "item_id": 5 }
```

**Example — Clear cart:**
```json
{ "sub_action": "clear" }
```

**Expected result:**
```json
{ "success": true, "action": "add_to_cart", "message": "Added 2x Masala Dosa to cart.", "data": { "item_id": 5, "name": "Masala Dosa", "quantity": 2 } }
```

---

### 7. `customer_get_profile`

**Purpose:** Retrieve the authenticated customer's profile.

**Frontend/Backend:** Backend (PostgreSQL read, ownership-validated)

**Parameters:** None (customer identity from context)

**Example call:** `{}`

**Expected result:**
```json
{
  "success": true,
  "profile": {
    "id": 42,
    "name": "Sriraam",
    "phone": "9876543210",
    "email": "sriraam@example.com",
    "loyalty_points": 350,
    "profile_picture_url": null
  }
}
```

---

### 8. `customer_get_rewards`

**Purpose:** Retrieve the authenticated customer's reward points.

**Frontend/Backend:** Backend (PostgreSQL read, ownership-validated)

**Parameters:** None

**Example call:** `{}`

**Expected result:**
```json
{
  "success": true,
  "rewards": {
    "customer_id": 42,
    "customer_name": "Sriraam",
    "reward_points": 350,
    "tier": "Standard"
  }
}
```

---

### 9. `customer_get_orders`

**Purpose:** Retrieve the customer's recent order history.

**Frontend/Backend:** Backend (PostgreSQL read, ownership-validated)

**Parameters:**
| Parameter | Type    | Required | Description                         |
|-----------|---------|----------|-------------------------------------|
| limit     | integer | No       | Number of orders to return (max 20) |

**Example call:**
```json
{ "limit": 5 }
```

**Expected result:**
```json
{
  "success": true,
  "orders": [
    {
      "id": 101,
      "order_id": "ORD-101",
      "order_type": "Take Away",
      "status": "READY",
      "total_amount": 200.0,
      "payment_status": "PAID",
      "created_at": "2026-09-30 12:00:00",
      "table_number": null
    }
  ],
  "count": 1
}
```

---

### 10. `customer_get_order`

**Purpose:** Retrieve details of a specific order.

**Frontend/Backend:** Backend (PostgreSQL read, ownership-validated)

**Parameters:**
| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| order_id  | string | Yes      | The DB order ID or order_id    |

**Example call:**
```json
{ "order_id": "101" }
```

---

### 11. `order_get_tracking`

**Purpose:** Get current status and delivery tracking for an order.

**Frontend/Backend:** Backend (PostgreSQL read, ownership-validated)

**Parameters:**
| Parameter | Type   | Required | Description          |
|-----------|--------|----------|----------------------|
| order_id  | string | Yes      | The DB order ID      |

**Example call:**
```json
{ "order_id": "101" }
```

**Expected result:**
```json
{
  "success": true,
  "tracking": {
    "order_id": 101,
    "order_type": "Delivery",
    "restaurant_status": "PREPARING",
    "delivery_status": "ASSIGNED",
    "rider_name": "Raju",
    "has_rider": true,
    "status_history": [
      { "status": "ASSIGNED", "timestamp": "2026-09-30 12:05:00" }
    ]
  }
}
```

---

### 12. `catering_get_data`

**Purpose:** Retrieve catering packages or customer catering order details.

**Frontend/Backend:** Backend (PostgreSQL read)

**Parameters:**
| Parameter          | Type    | Required | Description                                              |
|--------------------|---------|----------|----------------------------------------------------------|
| data_type          | string  | Yes      | One of: `packages`, `customer_orders`, `single_order`   |
| catering_order_id  | integer | Cond.    | Required when data_type = `single_order`                 |

**Example — Get packages:**
```json
{ "data_type": "packages" }
```

**Example — Get customer's catering orders:**
```json
{ "data_type": "customer_orders" }
```

---

### 13. `app_confirm_action`

**Purpose:** Signals that the LLM has requested confirmation from the user.
The LLM handles the conversation turn; this tool is used for tracking state.

**Frontend/Backend:** Frontend (no-op — conversational state only)

**Parameters:** None

---

## Vapi Dashboard — Tool Configuration Steps

### Step 1 — Create a New Assistant
1. Go to https://dashboard.vapi.ai
2. Click **New Assistant**
3. Name: `Data Udipi Customer Assistant`

### Step 2 — Configure the Model
1. Provider: `Anthropic`
2. Model: `claude-sonnet-4-5`
3. Paste the system prompt from `mobile_customer_agent.py → MOBILE_CUSTOMER_AGENT_PROMPT`

### Step 3 — Configure Voice
1. Provider: `11Labs` (or `deepgram`, `azure`)
2. Select a warm, natural Indian-English voice

### Step 4 — Set First Message
```
Vanakkam! Welcome to Data Udipi Veg Restaurant. I am your dining assistant. How may I help you today?
```

### Step 5 — Add Tools
For each tool above:
1. Click **Add Tool** → **Function**
2. Set **Name** to the exact `snake_case` name (e.g. `app_navigate`)
3. Set **Description** matching the purpose above
4. Add each parameter with its type, required flag, and description
5. Set the **Server URL** to your backend:
   ```
   https://your-backend-domain.com/api/v1/public/mcp/mobile-agent-tool
   ```
   With POST method and Content-Type: application/json

> **Note:** Tools that are purely frontend (app_navigate, app_go_back,
> app_get_context, set_order_type, cart_update, app_confirm_action) are
> handled client-side in `vapiStore.ts → handleVapiToolCall()` and do NOT
> need a server URL — they run immediately in the React Native app.
>
> Backend tools (menu_search, customer_get_profile, customer_get_rewards,
> customer_get_orders, customer_get_order, order_get_tracking,
> catering_get_data) must point to the backend server URL above.

### Step 6 — Get the Assistant ID
After saving, copy the **Assistant ID** from the dashboard.
Set in `.env`:
```
EXPO_PUBLIC_VAPI_ASSISTANT_ID=<your-assistant-id>
```

### Step 7 — Get the Public Key
Copy the **Public Key** (NOT the private key!) from Vapi Dashboard → API Keys.
Set in `.env`:
```
EXPO_PUBLIC_VAPI_PUBLIC_KEY=<your-public-key>
```

> ⚠️ The **Private Key** must NEVER be placed in the mobile app or any
> client-side file. It belongs only in server-side environment variables.

---

## Environment Variables Required

```env
# Frontend (.env in Mobileapp_frontend/)
EXPO_PUBLIC_VAPI_PUBLIC_KEY=vapi_pub_xxxxx
EXPO_PUBLIC_VAPI_ASSISTANT_ID=xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
EXPO_PUBLIC_API_BASE_URL=https://your-backend-domain.com
```

---

## Data Flow Summary

| User Says | Tool Called | Where Executed | Action |
|-----------|-------------|----------------|--------|
| "Go to profile" | app_navigate | Frontend | router.push('/profile') |
| "Go back" | app_go_back | Frontend | router.back() |
| "What's in my cart?" | app_get_context | Frontend | Read Zustand state |
| "I want takeaway" | set_order_type | Frontend | useCartStore.setOrderType('Take Away') |
| "Add 2 masala dosa" | menu_search + cart_update | Backend + Frontend | Fetch real ID, then addItem() |
| "How many points do I have?" | customer_get_rewards | Backend | PostgreSQL read → speak real value |
| "Show my orders" | customer_get_orders | Backend | PostgreSQL read → speak recent orders |
| "Where is my delivery?" | order_get_tracking | Backend | PostgreSQL read → speak status |
| "Show catering packages" | catering_get_data | Backend | PostgreSQL read + navigate |
| "What's my catering balance?" | catering_get_data | Backend | PostgreSQL read → speak balance |

---

## Security Guarantees

- ✅ No direct database access from the LLM
- ✅ No generic execute_sql, insert_record, update_record, delete_record tools
- ✅ No database schema changes
- ✅ No private keys in mobile app
- ✅ Customer ownership validated server-side (phone/customer_id cross-check)
- ✅ No other customer's data returned
- ✅ All cart mutations are frontend-only (unplaced order state)
- ✅ Order/payment persistence handled by existing APIs only
- ✅ Vapi public key only is used in the SDK
