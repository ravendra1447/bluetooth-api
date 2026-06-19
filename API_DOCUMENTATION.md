# Prepaid Meter & Tenant Billing API - Complete Documentation

**Base URL:** `http://localhost:8000/api`

**Port:** 8000

**Database:** MySQL

---

## 📋 Table of Contents

1. [Authentication](#authentication)
2. [Owner APIs](#owner-apis)
3. [Tenant APIs](#tenant-apis)
4. [Master APIs](#master-apis)
5. [Error Responses](#error-responses)
6. [Testing](#testing)

---

## 🔐 Authentication

### API Info
**GET** `/`

**Response:**
```json
{
  "success": true,
  "message": "Prepaid Meter & Tenant Billing API",
  "version": "1.0",
  "note": "Use Master Web Panel for full management. Login: 9999999999 / master123"
}
```

### Owner Register
**POST** `/auth/owner/register`

**Request Body:**
```json
{
  "name": "Ravi Kumar",
  "mobile": "9876543210",
  "email": "ravi@owner.com",
  "password": "password123",
  "password_confirmation": "password123"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Owner registered successfully.",
  "data": {
    "user": {
      "id": 2,
      "name": "Ravi Kumar",
      "mobile": "9876543210",
      "email": "ravi@owner.com",
      "role": "owner",
      "is_active": 1
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Validation Rules:**
- `name`: Required, max 255 characters
- `mobile`: Required, 10 digits, starts with 6-9
- `email`: Optional, valid email format
- `password`: Required, min 6 characters
- `password_confirmation`: Required, must match password

### Tenant Register
**POST** `/auth/tenant/register`

**Request Body:**
```json
{
  "name": "Amit Singh",
  "mobile": "9123456789",
  "email": "amit@tenant.com",
  "password": "password123",
  "password_confirmation": "password123",
  "property_code": "PROP-FLAT101",
  "move_in_date": "2025-01-15"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Tenant registered and linked to property successfully.",
  "data": {
    "user": {
      "id": 4,
      "name": "Amit Singh",
      "mobile": "9123456789",
      "email": "amit@tenant.com",
      "role": "tenant",
      "is_active": 1
    },
    "property": {
      "id": 1,
      "name": "Flat 101 - Green Heights",
      "property_code": "PROP-FLAT101"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Validation Rules:**
- `name`: Required, max 255 characters
- `mobile`: Required, 10 digits
- `email`: Optional, valid email format
- `password`: Required, min 6 characters
- `password_confirmation`: Required, must match password
- `property_code`: Required, 5-20 characters
- `move_in_date`: Optional, valid date format (YYYY-MM-DD)

### Login
**POST** `/auth/login`

**Request Body:**
```json
{
  "mobile": "9876543210",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user": {
      "id": 2,
      "name": "Ravi Kumar",
      "mobile": "9876543210",
      "email": "ravi@owner.com",
      "role": "owner",
      "is_active": 1
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Get Current User (Me)
**GET** `/auth/me`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200) - Owner:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "name": "Ravi Kumar",
      "mobile": "9876543210",
      "email": "ravi@owner.com",
      "role": "owner",
      "is_active": 1
    },
    "properties_count": 2
  }
}
```

**Response (200) - Tenant:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 4,
      "name": "Amit Singh",
      "mobile": "9123456789",
      "email": "amit@tenant.com",
      "role": "tenant",
      "is_active": 1
    },
    "property": {
      "id": 1,
      "property_id": 1,
      "tenant_id": 4,
      "move_in_date": "2025-01-15",
      "status": "active",
      "property_code": "PROP-FLAT101",
      "name": "Flat 101 - Green Heights",
      "address": "101, Green Heights, Sector 15",
      "monthly_rent": "15000.00"
    },
    "meters": [
      {
        "id": 1,
        "property_id": 1,
        "meter_name": "Flat 101 Main Meter",
        "meter_number": "MTR-001",
        "model_number": "GENUS-1020",
        "series_number": "SN-2024-001",
        "meter_type": "prepaid",
        "current_balance": "350.50",
        "tariff_per_unit": "8.50",
        "status": "active"
      }
    ]
  }
}
```

### Logout
**POST** `/auth/logout`

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

---

## 👤 Owner APIs

**Headers for all Owner APIs:**
```
Authorization: Bearer {owner_token}
```

### List Properties
**GET** `/owner/properties`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "owner_id": 2,
      "property_code": "PROP-FLAT101",
      "name": "Flat 101 - Green Heights",
      "address": "101, Green Heights, Sector 15",
      "city": "Noida",
      "state": "Uttar Pradesh",
      "pincode": "201301",
      "monthly_rent": "15000.00",
      "status": "active",
      "created_at": "2026-06-18T10:00:00.000000Z",
      "updated_at": "2026-06-18T10:00:00.000000Z",
      "active_tenants_count": 1,
      "electricity_meters_count": 2
    }
  ]
}
```

### Create Property
**POST** `/owner/properties`

**Request Body:**
```json
{
  "name": "Flat 101 - Green Heights",
  "address": "101, Green Heights, Sector 15",
  "city": "Noida",
  "state": "Uttar Pradesh",
  "pincode": "201301",
  "monthly_rent": 15000,
  "status": "active"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Property created successfully. Share the property code with your tenant.",
  "data": {
    "id": 1,
    "owner_id": 2,
    "property_code": "PROP-ABC12345",
    "name": "Flat 101 - Green Heights",
    "address": "101, Green Heights, Sector 15",
    "city": "Noida",
    "state": "Uttar Pradesh",
    "pincode": "201301",
    "monthly_rent": "15000.00",
    "status": "active",
    "created_at": "2026-06-18T10:00:00.000000Z",
    "updated_at": "2026-06-18T10:00:00.000000Z"
  }
}
```

### Get Property Details
**GET** `/owner/properties/:id`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "property_code": "PROP-FLAT101",
    "name": "Flat 101 - Green Heights",
    "address": "101, Green Heights, Sector 15",
    "monthly_rent": "15000.00",
    "status": "active",
    "active_tenants": [
      {
        "id": 1,
        "property_id": 1,
        "tenant_id": 4,
        "move_in_date": "2025-01-15",
        "status": "active",
        "name": "Amit Singh",
        "mobile": "9123456789",
        "email": "amit@tenant.com"
      }
    ],
    "electricity_meters": [
      {
        "id": 1,
        "property_id": 1,
        "meter_name": "Flat 101 Main Meter",
        "meter_number": "MTR-001",
        "model_number": "GENUS-1020",
        "series_number": "SN-2024-001",
        "meter_type": "prepaid",
        "current_balance": "350.50",
        "status": "active"
      }
    ]
  }
}
```

### Update Property
**PUT** `/owner/properties/:id`

**Request Body:**
```json
{
  "name": "Flat 101 Updated",
  "monthly_rent": 16000,
  "status": "active"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Property updated successfully.",
  "data": {
    "id": 1,
    "name": "Flat 101 Updated",
    "monthly_rent": "16000.00"
  }
}
```

### Regenerate Property Code
**POST** `/owner/properties/:id/regenerate-code`

**Response (200):**
```json
{
  "success": true,
  "message": "Property code regenerated successfully.",
  "data": {
    "property_code": "PROP-XYZ98765"
  }
}
```

### List Property Tenants
**GET** `/owner/properties/:id/tenants`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "property_id": 1,
      "tenant_id": 4,
      "move_in_date": "2025-01-15",
      "move_out_date": null,
      "status": "active",
      "name": "Amit Singh",
      "mobile": "9123456789",
      "email": "amit@tenant.com"
    }
  ]
}
```

### List Property Meters
**GET** `/owner/properties/:id/meters`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "property_id": 1,
      "meter_name": "Flat 101 Main Meter",
      "meter_number": "MTR-001",
      "model_number": "GENUS-1020",
      "series_number": "SN-2024-001",
      "meter_type": "prepaid",
      "initial_balance": "500.00",
      "current_balance": "350.50",
      "tariff_per_unit": "8.50",
      "last_reading": "0.00",
      "status": "active"
    }
  ]
}
```

### Add Meter to Property
**POST** `/owner/properties/:id/meters`

**Request Body:**
```json
{
  "meter_name": "Flat 101 Main Meter",
  "meter_number": "MTR-001",
  "model_number": "GENUS-1020",
  "series_number": "SN-2024-001",
  "meter_type": "prepaid",
  "initial_balance": 500,
  "current_balance": 500,
  "tariff_per_unit": 8.5,
  "last_reading": 0,
  "status": "active"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Electricity meter added successfully.",
  "data": {
    "id": 1,
    "property_id": 1,
    "meter_name": "Flat 101 Main Meter",
    "meter_number": "MTR-001",
    "model_number": "GENUS-1020",
    "series_number": "SN-2024-001",
    "meter_type": "prepaid",
    "initial_balance": "500.00",
    "current_balance": "500.00",
    "tariff_per_unit": "8.50",
    "status": "active"
  }
}
```

### Get Meter Details
**GET** `/owner/meters/:id`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "meter_name": "Flat 101 Main Meter",
    "meter_number": "MTR-001",
    "model_number": "GENUS-1020",
    "series_number": "SN-2024-001",
    "meter_type": "prepaid",
    "current_balance": "350.50",
    "property_name": "Flat 101 - Green Heights",
    "property_code": "PROP-FLAT101"
  }
}
```

### Update Meter
**PUT** `/owner/meters/:id`

**Request Body:**
```json
{
  "meter_name": "Flat 101 Main Meter Updated",
  "current_balance": 400,
  "tariff_per_unit": 9.0,
  "status": "active"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Electricity meter updated successfully.",
  "data": {
    "id": 1,
    "meter_name": "Flat 101 Main Meter Updated",
    "current_balance": "400.00",
    "tariff_per_unit": "9.00"
  }
}
```

### Delete Meter
**DELETE** `/owner/meters/:id`

**Response (200):**
```json
{
  "success": true,
  "message": "Electricity meter deleted successfully."
}
```

---

## 👥 Tenant APIs

**Headers for all Tenant APIs:**
```
Authorization: Bearer {tenant_token}
```

### Get Linked Property
**GET** `/tenant/property`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "assignment": {
      "id": 1,
      "property_id": 1,
      "tenant_id": 4,
      "move_in_date": "2025-01-15",
      "status": "active"
    },
    "property": {
      "id": 1,
      "property_code": "PROP-FLAT101",
      "name": "Flat 101 - Green Heights",
      "address": "101, Green Heights, Sector 15",
      "monthly_rent": "15000.00"
    },
    "owner": {
      "id": 2,
      "name": "Ravi Kumar",
      "mobile": "9876543210"
    }
  }
}
```

### Get Property Meters
**GET** `/tenant/meters`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "meter_name": "Flat 101 Main Meter",
      "meter_number": "MTR-001",
      "model_number": "GENUS-1020",
      "series_number": "SN-2024-001",
      "meter_type": "prepaid",
      "current_balance": "350.50",
      "tariff_per_unit": "8.50",
      "relay_status": "ON",
      "status": "active"
    }
  ]
}
```

### Get Tenant Bills
**GET** `/tenant/bills`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "meter_id": 1,
      "month": 6,
      "year": 2026,
      "previous_reading": "1435.00",
      "current_reading": "1500.45",
      "units": "65.45",
      "rate": "8.50",
      "amount": "556.33",
      "previous_due": "0.00",
      "paid_amount": "0.00",
      "outstanding": "556.33",
      "due_date": "2026-07-07",
      "status": "pending",
      "meter_name": "Flat 101 Main Meter",
      "meter_number": "MTR-001",
      "relay_status": "ON"
    }
  ]
}
```

### Get Current Bill
**GET** `/tenant/current-bill`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "meter_id": 1,
    "month": 6,
    "year": 2026,
    "previous_reading": "1435.00",
    "current_reading": "1500.45",
    "units": "65.45",
    "rate": "8.50",
    "amount": "556.33",
    "previous_due": "0.00",
    "paid_amount": "0.00",
    "outstanding": "556.33",
    "due_date": "2026-07-07",
    "status": "pending",
    "meter_name": "Flat 101 Main Meter",
    "meter_number": "MTR-001",
    "relay_status": "ON",
    "current_balance": "350.50"
  }
}
```

---

## 💳 Payment APIs

**Headers for all Payment APIs:**
```
Authorization: Bearer {token}
```

### Pay Outstanding
**POST** `/api/payment/pay`

**Request Body:**
```json
{
  "billId": 1,
  "amount": 556.33,
  "paymentMethod": "UPI",
  "transactionId": "TXN123456"
}
```

**Response (200) - Full Payment:**
```json
{
  "success": true,
  "message": "Payment successful.",
  "data": {
    "paidAmount": 556.33,
    "outstanding": 0,
    "status": "paid",
    "relayStatus": "ON"
  }
}
```

**Response (200) - Partial Payment:**
```json
{
  "success": true,
  "message": "Payment successful.",
  "data": {
    "paidAmount": 300.00,
    "outstanding": 256.33,
    "status": "pending",
    "relayStatus": "OFF"
  }
}
```

**Logic:**
- If outstanding = 0 after payment → Status = paid, Relay = ON
- If outstanding > 0 → Status = pending, Relay = OFF (if date > 7th)

### Get Payment History for Bill
**GET** `/api/payment/bill/:billId`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "bill_id": 1,
      "amount": "556.33",
      "payment_method": "UPI",
      "transaction_id": "TXN123456",
      "status": "success",
      "created_at": "2026-07-05T10:30:00.000000Z"
    }
  ]
}
```

### Update Relay Status (Manual)
**POST** `/api/payment/update-relay`

**Request Body:**
```json
{
  "meterId": 1,
  "outstanding": 0
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Relay status updated.",
  "data": {
    "relayStatus": "ON",
    "reason": "Outstanding Cleared"
  }
}
```

**Logic:**
- If outstanding = 0 → Relay = ON
- If outstanding > 0 AND date > 7th → Relay = OFF
- If outstanding > 0 AND date <= 7th → Relay = ON (grace period)

### Get Relay Logs
**GET** `/api/payment/relay-logs/:meterId`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "meter_id": 1,
      "relay_status": "ON",
      "reason": "Outstanding Cleared - Payment Received",
      "created_at": "2026-07-05T10:30:00.000000Z"
    },
    {
      "id": 2,
      "meter_id": 1,
      "relay_status": "OFF",
      "reason": "Outstanding Pending",
      "created_at": "2026-07-08T00:00:00.000000Z"
    }
  ]
}
```

---

## 🧾 Billing APIs (Owner)

### Generate Bill for Meter
**POST** `/api/owner/meters/:id/generate-bill`

**Request Body:**
```json
{
  "month": 6,
  "year": 2026,
  "currentReading": 1500.45
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Bill generated successfully.",
  "data": {
    "id": 1,
    "meter_id": 1,
    "month": 6,
    "year": 2026,
    "previous_reading": "1435.00",
    "current_reading": "1500.45",
    "units": "65.45",
    "rate": "8.50",
    "amount": "556.33",
    "previous_due": "0.00",
    "paid_amount": "0.00",
    "outstanding": "556.33",
    "due_date": "2026-07-07",
    "status": "pending"
  }
}
```

**Logic:**
- Units = Current Reading - Previous Reading
- Amount = Units × Rate
- Outstanding = Amount + Previous Due
- Due Date = 7th of next month

### Get Bills for Property
**GET** `/api/owner/properties/:id/bills`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "meter_id": 1,
      "month": 6,
      "year": 2026,
      "amount": "556.33",
      "outstanding": "556.33",
      "status": "pending",
      "meter_name": "Flat 101 Main Meter",
      "meter_number": "MTR-001"
    }
  ]
}
```

---

## 🎛️ Master APIs

**Headers for all Master APIs:**
```
Authorization: Bearer {master_token}
```

**Test Credentials:**
- Mobile: `9999999999`
- Password: `master123`

### Dashboard Stats
**GET** `/master/dashboard`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "owners_count": 25,
    "tenants_count": 78,
    "properties_count": 42,
    "meters_count": 65,
    "active_tenants": 72
  }
}
```

### List Owners
**GET** `/master/owners`

**Query Params:**
- `page`: Page number (default: 1)
- `per_page`: Items per page (default: 20)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "current_page": 1,
    "data": [
      {
        "id": 2,
        "name": "Ravi Kumar",
        "mobile": "9876543210",
        "email": "ravi@owner.com",
        "role": "owner",
        "is_active": 1,
        "owned_properties_count": 2
      }
    ],
    "per_page": 20,
    "total": 2
  }
}
```

### Create Owner
**POST** `/master/owners`

**Request Body:**
```json
{
  "name": "New Owner",
  "mobile": "9876500000",
  "email": "new@owner.com",
  "password": "password123",
  "is_active": true
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Owner created successfully.",
  "data": {
    "id": 7,
    "name": "New Owner",
    "mobile": "9876500000",
    "role": "owner",
    "is_active": 1
  }
}
```

### Get Owner Details
**GET** `/master/owners/:id`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "Ravi Kumar",
    "mobile": "9876543210",
    "email": "ravi@owner.com",
    "role": "owner",
    "is_active": 1,
    "owned_properties": [
      {
        "id": 1,
        "property_code": "PROP-FLAT101",
        "name": "Flat 101 - Green Heights",
        "electricity_meters": [],
        "active_tenants": []
      }
    ]
  }
}
```

### Update Owner
**PUT** `/master/owners/:id`

**Request Body:**
```json
{
  "name": "Ravi Kumar Updated",
  "is_active": true
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Owner updated successfully.",
  "data": {
    "id": 2,
    "name": "Ravi Kumar Updated"
  }
}
```

### Delete Owner
**DELETE** `/master/owners/:id`

**Response (200):**
```json
{
  "success": true,
  "message": "Owner deleted successfully."
}
```

### List Properties
**GET** `/master/properties`

**Query Params:**
- `owner_id`: Filter by owner ID
- `page`: Page number (default: 1)
- `per_page`: Items per page (default: 20)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "current_page": 1,
    "data": [
      {
        "id": 1,
        "owner_id": 2,
        "property_code": "PROP-FLAT101",
        "name": "Flat 101 - Green Heights",
        "monthly_rent": "15000.00",
        "status": "active",
        "owner_name": "Ravi Kumar",
        "owner_mobile": "9876543210",
        "active_tenants_count": 1,
        "electricity_meters_count": 2
      }
    ],
    "per_page": 20,
    "total": 3
  }
}
```

### Create Property
**POST** `/master/properties`

**Request Body:**
```json
{
  "owner_id": 2,
  "name": "Flat 101 - Green Heights",
  "address": "101, Green Heights, Sector 15",
  "city": "Noida",
  "state": "Uttar Pradesh",
  "pincode": "201301",
  "monthly_rent": 15000,
  "status": "active"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Property created successfully.",
  "data": {
    "id": 1,
    "property_code": "PROP-ABC12345",
    "name": "Flat 101 - Green Heights",
    "owner_id": 2
  }
}
```

### Get Property Details
**GET** `/master/properties/:id`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "property_code": "PROP-FLAT101",
    "name": "Flat 101 - Green Heights",
    "owner_name": "Ravi Kumar",
    "owner_mobile": "9876543210",
    "electricity_meters": [],
    "tenants": []
  }
}
```

### Update Property
**PUT** `/master/properties/:id`

**Request Body:**
```json
{
  "name": "Updated Property Name",
  "monthly_rent": 18000,
  "status": "active"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Property updated successfully.",
  "data": {}
}
```

### Delete Property
**DELETE** `/master/properties/:id`

**Response (200):**
```json
{
  "success": true,
  "message": "Property deleted successfully."
}
```

### Regenerate Property Code
**POST** `/master/properties/:id/regenerate-code`

**Response (200):**
```json
{
  "success": true,
  "message": "Property code regenerated.",
  "data": {
    "property_code": "PROP-NEW12345"
  }
}
```

### List Tenants
**GET** `/master/tenants`

**Query Params:**
- `property_id`: Filter by property ID
- `page`: Page number (default: 1)
- `per_page`: Items per page (default: 20)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "current_page": 1,
    "data": [
      {
        "id": 1,
        "property_id": 1,
        "tenant_id": 4,
        "move_in_date": "2025-01-15",
        "status": "active",
        "tenant_name": "Amit Singh",
        "tenant_mobile": "9123456789",
        "property_name": "Flat 101 - Green Heights",
        "property_code": "PROP-FLAT101"
      }
    ],
    "per_page": 20,
    "total": 3
  }
}
```

### Create Tenant
**POST** `/master/tenants`

**Request Body:**
```json
{
  "name": "New Tenant",
  "mobile": "9123400000",
  "email": "tenant@email.com",
  "password": "password123",
  "property_id": 1,
  "move_in_date": "2025-06-01",
  "status": "active"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Tenant created and linked to property.",
  "data": {
    "id": 4,
    "property_id": 1,
    "tenant_id": 8,
    "status": "active",
    "tenant_name": "New Tenant",
    "tenant_mobile": "9123400000",
    "property_name": "Flat 101 - Green Heights"
  }
}
```

### Update Tenant Assignment
**PUT** `/master/tenants/:id`

**Request Body:**
```json
{
  "move_in_date": "2025-01-15",
  "move_out_date": "2026-01-15",
  "status": "inactive"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Tenant assignment updated.",
  "data": {}
}
```

### Delete Tenant
**DELETE** `/master/tenants/:id`

**Response (200):**
```json
{
  "success": true,
  "message": "Tenant removed successfully."
}
```

### List Meters
**GET** `/master/meters`

**Query Params:**
- `property_id`: Filter by property ID
- `page`: Page number (default: 1)
- `per_page`: Items per page (default: 20)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "current_page": 1,
    "data": [
      {
        "id": 1,
        "property_id": 1,
        "meter_name": "Flat 101 Main Meter",
        "meter_number": "MTR-001",
        "model_number": "GENUS-1020",
        "series_number": "SN-2024-001",
        "meter_type": "prepaid",
        "current_balance": "350.50",
        "property_name": "Flat 101 - Green Heights",
        "property_code": "PROP-FLAT101"
      }
    ],
    "per_page": 20,
    "total": 4
  }
}
```

### Create Meter
**POST** `/master/meters`

**Request Body:**
```json
{
  "property_id": 1,
  "meter_name": "Flat 101 Main Meter",
  "meter_number": "MTR-001",
  "model_number": "GENUS-1020",
  "series_number": "SN-2024-001",
  "meter_type": "prepaid",
  "initial_balance": 500,
  "current_balance": 500,
  "tariff_per_unit": 8.5,
  "last_reading": 0,
  "status": "active"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Meter created successfully.",
  "data": {
    "id": 1,
    "meter_name": "Flat 101 Main Meter",
    "meter_number": "MTR-001",
    "property_name": "Flat 101 - Green Heights",
    "property_code": "PROP-FLAT101"
  }
}
```

### Update Meter
**PUT** `/master/meters/:id`

**Request Body:**
```json
{
  "meter_name": "Updated Meter Name",
  "current_balance": 600,
  "status": "active"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Meter updated successfully.",
  "data": {}
}
```

### Delete Meter
**DELETE** `/master/meters/:id`

**Response (200):**
```json
{
  "success": true,
  "message": "Meter deleted successfully."
}
```

---

## ❌ Error Responses

### Validation Error (422)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "mobile": ["The mobile must be 10 digits."],
    "password": ["The password must be at least 6 characters."]
  }
}
```

### Unauthorized (401)
```json
{
  "success": false,
  "message": "Unauthenticated."
}
```

### Forbidden (403)
```json
{
  "success": false,
  "message": "Only property owners can access this resource."
}
```

### Not Found (404)
```json
{
  "success": false,
  "message": "User not found."
}
```

### Internal Server Error (500)
```json
{
  "success": false,
  "message": "Internal server error"
}
```

### Duplicate Entry (422)
```json
{
  "success": false,
  "message": "Mobile number already exists."
}
```

---

## 🧪 Testing

### Using cURL

#### Test API Info
```bash
curl http://localhost:8000/api
```

#### Register Owner
```bash
curl -X POST http://localhost:8000/api/auth/owner/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ravi Kumar",
    "mobile": "9876543210",
    "email": "ravi@owner.com",
    "password": "password123",
    "password_confirmation": "password123"
  }'
```

#### Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "mobile": "9876543210",
    "password": "password123"
  }'
```

#### Get Properties (Owner)
```bash
curl http://localhost:8000/api/owner/properties \
  -H "Authorization: Bearer {token}"
```

### Using Postman

1. Import the collection
2. Set base URL: `http://localhost:8000/api`
3. Add authentication token to headers
4. Test endpoints

---

## 📝 Notes

- All dates are in ISO 8601 format
- All monetary values are in INR (₹)
- Token expiration: 7 days
- Passwords are hashed using bcrypt
- All POST/PUT requests have validation
- Role-based access control is enforced
- Database uses prepared statements to prevent SQL injection

---

## 🚀 Quick Start

1. Install dependencies:
```bash
cd backend
npm install
```

2. Configure `.env`:
```
PORT=8000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=meter_db
JWT_SECRET=your_jwt_secret_key
```

3. Setup database:
```bash
npm run setup
```

4. Start server:
```bash
npm run dev
```

5. Test API:
```bash
curl http://localhost:8000/api
```
