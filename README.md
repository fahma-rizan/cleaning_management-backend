# ☁️ Cloud Laundry Services — Backend API

Node.js + Express.js + MongoDB REST API for the Cloud Laundry Services frontend.

---

## 📁 Project Structure

```
cloud-laundry-backend/
├── src/
│   ├── server.js                  # Entry point
│   ├── config/
│   │   ├── db.js                  # MongoDB connection
│   │   └── seed.js                # Database seeder
│   ├── models/
│   │   ├── User.js
│   │   ├── Service.js
│   │   ├── Booking.js
│   │   ├── Notification.js
│   │   └── Offer.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── service.controller.js
│   │   ├── booking.controller.js
│   │   ├── notification.controller.js
│   │   └── offer.controller.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── service.routes.js
│   │   ├── booking.routes.js
│   │   ├── notification.routes.js
│   │   └── offer.routes.js
│   └── middleware/
│       └── auth.middleware.js
├── .env.example
├── package.json
└── README.md
```

---

## ⚙️ Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Edit `.env` with your values:
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/cloud_laundry
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

### 3. Seed the database
```bash
npm run seed
```
This creates:
- All 13 laundry/cleaning services
- 3 sample promo offers
- Admin account: `admin@cloudlaundry.lk` / `Admin@1234`
- Demo customer: `demo@cloudlaundry.lk` / `Demo@1234`

### 4. Start the server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs at: `http://localhost:5000`

---

## 🔌 API Endpoints

### Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |

### Auth — `/api/auth`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | Public | Create new customer account |
| POST | `/login` | Public | Login, returns JWT token |
| GET | `/me` | 🔒 Any | Get current user info |
| PUT | `/change-password` | 🔒 Any | Change password |

### Services — `/api/services`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Public | List all services (filter: `?category=home&search=clean`) |
| GET | `/:id` | Public | Get single service |
| POST | `/` | 🔒 Admin | Create service |
| PUT | `/:id` | 🔒 Admin | Update service |
| DELETE | `/:id` | 🔒 Admin | Soft-delete service |

### Bookings — `/api/bookings`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | 🔒 Any | Create booking |
| GET | `/` | 🔒 Any | List bookings (own for customer, all for admin/staff) |
| GET | `/stats` | 🔒 Admin/Staff | Booking statistics |
| GET | `/:id` | 🔒 Any | Get single booking |
| PUT | `/:id/status` | 🔒 Admin/Staff | Update booking status |
| PUT | `/:id/cancel` | 🔒 Customer | Cancel own booking |

### Users — `/api/users`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/profile` | 🔒 Any | Get own profile |
| PUT | `/profile` | 🔒 Any | Update own profile |
| GET | `/` | 🔒 Admin | List all users |
| PUT | `/:id` | 🔒 Admin | Update any user |
| DELETE | `/:id` | 🔒 Admin | Delete user |

### Notifications — `/api/notifications`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | 🔒 Any | Get own notifications |
| PUT | `/read-all` | 🔒 Any | Mark all as read |
| DELETE | `/` | 🔒 Any | Clear all notifications |
| PUT | `/:id/read` | 🔒 Any | Mark one as read |
| DELETE | `/:id` | 🔒 Any | Delete one notification |

### Offers — `/api/offers`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Public | Get active offers |
| POST | `/validate` | Public | Validate a promo code |
| POST | `/` | 🔒 Admin | Create offer |
| PUT | `/:id` | 🔒 Admin | Update offer |
| DELETE | `/:id` | 🔒 Admin | Delete offer |

---

## 🔐 Authentication

Include the JWT token in the `Authorization` header:
```
Authorization: Bearer <your_token>
```

---

## 📦 Example Requests

### Register
```json
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "0771234567"
}
```

### Login
```json
POST /api/auth/login
{
  "email": "demo@cloudlaundry.lk",
  "password": "Demo@1234"
}
```

### Create Booking
```json
POST /api/bookings
Authorization: Bearer <token>
{
  "serviceId": 1,
  "serviceName": "House Deep Cleaning",
  "mainServiceType": "Home/Office Cleaning",
  "serviceCategory": "House Deep Cleaning",
  "date": "2026-05-10",
  "time": "10:00 AM",
  "address": "123 Main St, Colombo 03",
  "houseSize": "medium",
  "rooms": 3,
  "bathrooms": 2,
  "frequency": "once",
  "packageType": "standard",
  "totalAmount": 8000,
  "specialInstructions": "Please bring eco-friendly products."
}
```

### Validate Promo Code
```json
POST /api/offers/validate
{
  "code": "WELCOME20",
  "serviceId": 1,
  "orderAmount": 8000
}
```

---

## 🔗 Connecting the Frontend

In your React frontend, set the base API URL:
```js
// src/config/api.js
export const API_BASE = 'http://localhost:5000/api';
```

Example fetch call:
```js
const res = await fetch(`${API_BASE}/services`);
const data = await res.json();
```

Authenticated call:
```js
const token = localStorage.getItem('token');
const res = await fetch(`${API_BASE}/bookings`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify(bookingData),
});
```
