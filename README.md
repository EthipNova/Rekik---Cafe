# NEBA Café Ordering & Management System

BUILD PROMPT — NEBA CAFÉ ORDERING & MANAGEMENT SYSTEM

Project

Build a modern, production-quality website for:

NEBA CAFÉ
Powered by ORNIX-TECH

The website should represent the complete NEBA Café Ordering & Management System and demonstrate the professional five-stage product development process used by ORNIX-TECH.

This is not just a static café landing page.

The website should communicate:

A real digital ordering platform built through a professional product-development process.

The five-stage process is:

Requirements & Product Definition

Product & UX/UI Design

System Architecture & Technical Design

Development & Implementation

Testing, Deployment & Continuous Improvement

1. PRIMARY GOAL

Build a complete, modern, responsive NEBA Café website that combines:

Customer-facing café ordering

Menu browsing

Product details

Cart

Checkout

Order tracking

Café information

Promotions

Customer account

Staff order management

Admin management

ORNIX-TECH technology/company presentation

Five-stage project/process presentation

The website should feel like a real product that could eventually be used by a real café.

Do NOT make it look like a generic template.

2. BRAND DIRECTION

Café Brand

Primary brand:

NEBA CAFÉ

Supporting brand:

Powered by ORNIX-TECH

The visual identity should feel:

modern

premium

warm

clean

welcoming

trustworthy

technology-driven

professional

Use a sophisticated café-inspired visual system.

Suggested visual direction:

deep coffee tones

warm cream/off-white

subtle gold/caramel accents

dark charcoal

clean white space

high-quality food imagery

subtle modern gradients

Avoid excessive colors.

Use one strong primary accent and a restrained neutral palette.

3. TECHNOLOGY BRAND

ORNIX-TECH should appear as the technology company responsible for building the platform.

The website should communicate that ORNIX-TECH does more than build websites.

Use the message:

Understand the Business → Design the Solution → Build the Product → Test → Deploy → Improve

Position ORNIX-TECH as a professional technology company that:

understands business problems

defines requirements

designs digital experiences

designs system architecture

builds software

tests software

deploys software

maintains software

continuously improves products

4. WEBSITE STRUCTURE

Create the following major sections/pages.

Public Customer Website

/

Home

/menu

Menu

/menu/:category

Category

/product/:id

Product Details

/cart

Cart

/checkout

Checkout

/order/:id

Order Tracking

/orders

Customer Order History

/account

Customer Account

/about

About NEBA Café

/contact

Contact

5. HOME PAGE

Create a visually impressive homepage.

Hero Section

Large high-quality café/food visual.

Headline:

Good Food. Great Moments. Simply NEBA.

Supporting text:

Discover your favorite meals, order with ease, and enjoy a seamless café experience powered by modern technology.

Primary CTA:

Order Now

Secondary CTA:

Explore Menu

Include subtle animation.

The hero should immediately communicate:

Café + Food + Digital Ordering

6. FEATURED MENU

Display selected products.

Example:

Burgers

Classic Burger

Cheese Burger

Chicken Burger

Pizza

Margherita Pizza

Chicken Pizza

Sides

French Fries

Drinks

Coca-Cola

Sprite

Water

Use realistic placeholder images if actual café images are unavailable.

Each product card should show:

image

name

description

price

availability

Add to Cart button

Do not hard-code the architecture in a way that prevents future API integration.

7. CATEGORIES

Create a visually attractive category section.

Example:

Burgers
Classic favorites

Pizza
Freshly prepared

Chips & Sides
Perfect additions

Soft Drinks
Refresh yourself

Other

Categories should be clickable.

8. WHY NEBA

Create a section explaining the customer benefits.

Example:

Easy Ordering

Browse and order without unnecessary steps.

Fresh Menu

See products and availability in real time.

Simple Checkout

A clear and convenient ordering process.

Order Tracking

Know what is happening with your order.

Secure Payments

Payments are handled through secure payment infrastructure.

9. ORDERING PROCESS

Visually explain the customer journey:

1. Browse

Explore the menu.

↓

2. Choose

Select your favorite products.

↓

3. Cart

Review your order.

↓

4. Checkout

Provide the required information.

↓

5. Pay

Complete payment.

↓

6. Track

Follow your order status.

Make this section visually engaging with icons and subtle animations.

10. ORDERING METHODS

If supported by the system, display:

Dine-in

Enjoy your meal at the café.

Takeaway

Order ahead and collect your food.

Delivery

Have your order delivered to your location.

Each option should have a clear icon and short description.

11. PROMOTIONS

Create a promotions section.

Example:

Today's Special

Show a selected product or promotion.

Include:

product image

promotion title

discount

expiry information

CTA

The design should support future dynamic promotion data.

12. MENU PAGE

Create a professional menu experience.

Include:

category navigation

search

product cards

filtering

availability indicators

price

Add to Cart

Example:

MENU

[All] [Burgers] [Pizza] [Sides] [Drinks]

Search menu...

---

Classic Burger
Fresh beef patty, vegetables and special sauce

250 ETB

[Add to Cart]

---

Unavailable products should be visually clear.

Example:

Unavailable

and the user must not be able to add the product to a new order.

13. PRODUCT DETAILS

Create a dedicated product details page.

Display:

large product image

product name

description

ingredients where applicable

price

availability

quantity selector

Add to Cart

Example:

Classic Burger

250 ETB

Fresh beef patty with vegetables,
cheese and special sauce.

Quantity
[-] 1 [+]

[Add to Cart]

14. CART

Build a fully functional shopping cart.

Display:

YOUR CART

Classic Burger x2 500 ETB
French Fries x1 100 ETB

---

Subtotal 600 ETB
Discount 0 ETB
Delivery 0 ETB

TOTAL 600 ETB

[Proceed to Checkout]

Allow:

increase quantity

decrease quantity

remove item

clear cart

calculate subtotal

apply promotions

calculate total

The frontend can display calculations, but final totals must eventually be verified by the backend.

15. EMPTY CART

Create a beautiful empty state.

Example:

Your cart is empty

Looks like you haven't added anything yet.

CTA:

Explore Menu

16. CHECKOUT

Create a clean multi-step checkout.

Suggested steps:

Step 1

Customer Information

Step 2

Ordering Method

Step 3

Order Summary

Step 4

Payment

Step 5

Confirmation

Collect only information required by the approved business requirements.

17. ORDERING METHOD

Allow:

Dine-in

Input:

Table Number

Takeaway

Inputs:

Name
Phone

Delivery

Inputs:

Name
Phone
Delivery Address

Display the relevant fields dynamically depending on the selected method.

18. PAYMENT

Create a professional payment interface.

Display:

Order Summary

Payment Method

Payment Status

Example:

PAYMENT

Total
600 ETB

Payment Method

○ Mobile Payment
○ Other Supported Method

[Pay 600 ETB]

Never allow the frontend to independently declare payment success.

Structure the application so the backend can verify payment results.

19. ORDER CONFIRMATION

After successful order creation show:

Order Confirmed

Your order has been received successfully.

Display:

order number

order total

payment status

ordering method

estimated preparation information

tracking button

CTA:

Track Order

20. ORDER TRACKING

Create a beautiful order timeline.

Example:

ORDER #1023

✓ Order Received

✓ Confirmed

● Preparing

○ Ready

○ Completed

For delivery:

✓ Order Received
✓ Confirmed
✓ Preparing
✓ Ready
● Out for Delivery
○ Delivered
○ Completed

Use animated progress indicators.

21. CUSTOMER ACCOUNT

Create customer account functionality.

Sections:

Profile

Orders

Current Order

Order History

Addresses if supported

Logout

22. ABOUT NEBA CAFÉ

Create an attractive About page.

Explain:

café identity

food experience

customer experience

commitment to quality

modern ordering experience

Include strong photography and storytelling.

23. CONTACT PAGE

Include:

café location

phone

email

opening hours

social media

map placeholder/integration

contact form

Do not invent real contact information.

Use clearly marked placeholder data until official information is provided.

24. ORNIX-TECH SECTION

Create a dedicated section/page explaining the technology behind NEBA.

Headline:

Built by ORNIX-TECH

Description:

NEBA Café is powered by a professionally designed digital ordering and management system developed through ORNIX-TECH's five-stage product development process.

Show:

Understand

Requirements

Design

UX/UI

Architect

System Architecture

Build

Development

Prove

Testing

Launch

Deployment

Improve

Continuous Improvement

This should be one of the strongest sections of the website.

25. FIVE-STAGE PROCESS PAGE

Create a dedicated page:

/process

Title:

From Business Idea to Working Product

Display the five stages as a visual timeline.

STAGE 1

Requirements & Product Definition

Question:

What are we building and why?

Explain:

business problem

users

goals

scope

functional requirements

non-functional requirements

business rules

STAGE 2

Product & UX/UI Design

Question:

How will users experience it?

Explain:

information architecture

user journeys

user flows

wireframes

UI design

responsive behavior

error/loading/empty states

STAGE 3

System Architecture & Technical Design

Question:

How will the technology make it work?

Explain:

system architecture

database

APIs

authentication

authorization

payment architecture

security

deployment architecture

STAGE 4

Development & Implementation

Question:

How will we build it?

Explain:

frontend

backend

database

APIs

authentication

products

cart

checkout

orders

payments

notifications

admin dashboard

security

testing during development

STAGE 5

Testing, Deployment & Continuous Improvement

Question:

Does it work, can we launch it safely, and how will we improve it?

Explain:

unit testing

integration testing

end-to-end testing

security testing

performance testing

UAT

deployment

monitoring

backups

training

client handover

continuous improvement

26. INTERACTIVE FIVE-STAGE TIMELINE

Do not simply display five paragraphs.

Create an interactive experience.

Example:

01 ───── 02 ───── 03 ───── 04 ───── 05

WHAT? DESIGN ARCHITECT BUILD LAUNCH

When the user selects a stage:

animate the selected stage

display its description

display objectives

display deliverables

display the key question

show relevant icon/illustration

Make the interaction smooth and professional.

27. ADMIN DASHBOARD

Create a separate protected administration interface.

Route:

/admin

Dashboard sections:

Dashboard

Orders

Products

Categories

Availability

Payments

Promotions

Customers

Settings

Use a professional SaaS-style dashboard.

28. ADMIN DASHBOARD OVERVIEW

Display cards:

Today's Orders

24

Pending Orders

6

Completed Orders

18

Today's Revenue

8,450 ETB

Unavailable Products

3

These can initially use mock/demo data but must be structured for API integration.

29. ADMIN ORDER MANAGEMENT

Create an order-management interface.

Use status columns:

PENDING CONFIRMED PREPARING READY

#1024 #1021 #1020 #1018
#1025 #1022 #1023 #1019

Allow authorized staff to:

view order

confirm

prepare

mark ready

complete

handle delivery status

30. PRODUCT MANAGEMENT

Admin should be able to:

create product

edit product

deactivate product

change price

change availability

upload image

assign category

Create a professional data table and forms.

31. CATEGORY MANAGEMENT

Admin should be able to:

create category

edit category

activate/deactivate category

organize products

32. AVAILABILITY MANAGEMENT

Create a quick availability interface.

Example:

PRODUCT STATUS

Classic Burger ● Available
Chicken Burger ● Available
Margherita Pizza ○ Unavailable
French Fries ● Available

Use clear visual indicators.

33. AUTHENTICATION

Implement role-based authentication.

Roles:

CUSTOMER

Can:

browse

cart

checkout

create orders

view own orders

track orders

STAFF

Can:

view orders

process orders

update order status

manage availability where authorized

ADMIN

Can:

manage products

manage categories

manage promotions

manage users

manage settings

Never rely only on frontend route protection.

Backend authorization must be authoritative.

34. TECHNICAL ARCHITECTURE

Structure the application so it can support:

CUSTOMER FRONTEND
↓
REST API
↓
BACKEND
↓
BUSINESS LOGIC
↓
POSTGRESQL DATABASE
↓
EXTERNAL SERVICES
├── Payment
└── Notifications

Keep frontend and backend clearly separated.

Do not allow the frontend to directly manipulate the production database.

35. RECOMMENDED TECHNOLOGY

Use a modern production-ready stack.

Frontend

React

TypeScript

Vite

Tailwind CSS

Backend

Node.js

NestJS

TypeScript

Database

PostgreSQL

Prisma ORM

Authentication

Use secure token/session-based authentication.

API

REST API.

Validation

Validate data on both frontend and backend.

Testing

Use appropriate unit, integration and end-to-end testing tools.

The exact technology can be adjusted if the existing ORNIX-TECH architecture requires another choice.

36. DATABASE

Design a relational database around:

users
categories
products
orders
order_items
payments
addresses
promotions
notifications

Use:

primary keys

foreign keys

timestamps

indexes where appropriate

constraints

appropriate relationships

Use database migrations.

Do not manually modify production schemas.

37. SECURITY

Implement security from the beginning.

Include:

secure password hashing

authentication

authorization

input validation

API protection

rate limiting where appropriate

secure secrets

HTTPS in production

XSS protection

SQL injection protection

CSRF protection where applicable

secure cookies/tokens

restricted admin access

Never expose:

passwords

JWT secrets

API keys

payment credentials

database credentials

38. ERROR STATES

Every important screen must handle:

loading

success

error

empty state

Examples:

Loading menu...

Product unavailable.

Payment failed. Please try again.

Your cart is empty.

No orders yet.

Do not leave users staring at blank screens.

39. RESPONSIVE DESIGN

The entire website must be responsive.

Prioritize:

Mobile

Primary customer experience.

Tablet

Customer and staff experience.

Desktop

Customer and administrative experience.

Test:

navigation

menu

product pages

cart

checkout

order tracking

admin dashboard

40. ACCESSIBILITY

Implement good accessibility practices.

Include:

semantic HTML

keyboard navigation

accessible forms

readable contrast

alt text

visible focus states

proper labels

accessible buttons

meaningful error messages

41. ANIMATIONS

Use subtle professional animations.

Examples:

hero entrance animation

product card hover

cart updates

page transitions

order status transitions

five-stage timeline animation

dashboard interactions

Avoid excessive animations that make the application feel slow.

42. NAVIGATION

Desktop navigation:

NEBA

Home
Menu
About
Process
Contact

[Cart]
[Account]

If admin/staff is authenticated:

Admin Dashboard

Mobile navigation should use a clean mobile menu.

43. FOOTER

Footer should contain:

NEBA CAFÉ

Good Food. Great Moments.

Links:

Home

Menu

About

Contact

Process

Ordering:

Menu

Cart

Orders

Company:

Powered by ORNIX-TECH

Include copyright.

44. CODE ORGANIZATION

Keep the code modular.

Suggested structure:

project/

├── frontend/
│ ├── components/
│ ├── pages/
│ ├── layouts/
│ ├── hooks/
│ ├── services/
│ ├── stores/
│ └── types/
│
├── backend/
│ ├── auth/
│ ├── users/
│ ├── products/
│ ├── categories/
│ ├── cart/
│ ├── orders/
│ ├── payments/
│ ├── promotions/
│ ├── notifications/
│ └── administration/
│
├── database/
│ └── migrations/
│
├── tests/
│
└── documentation/

The exact structure may be adjusted according to the selected framework.

45. API DESIGN

Design REST APIs such as:

GET /api/products
GET /api/products/:id
POST /api/products
PATCH /api/products/:id
DELETE /api/products/:id

GET /api/categories
POST /api/categories
PATCH /api/categories/:id

POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout

POST /api/orders
GET /api/orders/my-orders
GET /api/orders/:id
PATCH /api/orders/:id/status

POST /api/payments
GET /api/payments/:id

GET /api/admin/dashboard

The exact endpoints can be adjusted during implementation.

46. API CONTRACT

Keep API contracts clear.

Every API should define:

method

endpoint

authentication requirement

request body

validation

response

error responses

permissions

Frontend should consume APIs through a dedicated API/service layer.

47. TESTING

Build testing into the project.

Include:

Unit Tests

Business logic.

Integration Tests

Frontend/backend/database interactions.

API Tests

Endpoint behavior.

End-to-End Tests

Customer ordering journey.

Security Tests

Authentication and authorization.

Responsive Tests

Mobile/tablet/desktop.

48. CUSTOMER E2E FLOW

The application should support this complete journey:

Home
↓
Menu
↓
Product
↓
Add to Cart
↓
Cart
↓
Checkout
↓
Ordering Method
↓
Payment
↓
Order Confirmation
↓
Order Tracking

This should be treated as the most important customer flow.

49. STAFF FLOW

Login
↓
Staff Dashboard
↓
Incoming Order
↓
Confirm
↓
Preparing
↓
Ready
↓
Completed

For delivery:

Ready
↓
Out for Delivery
↓
Delivered
↓
Completed

50. ADMIN FLOW

Login
↓
Admin Dashboard
↓
Products
↓
Categories
↓
Availability
↓
Orders
↓
Payments
↓
Promotions
↓
Users
↓
Settings

51. PRODUCTION-READY REQUIREMENTS

Do not build a fake prototype.

The architecture should be designed so that the application can eventually be deployed.

Include:

environment variables

development environment

staging environment

production configuration

database migrations

seed data

error handling

logging

monitoring hooks

backup strategy

deployment documentation

Never commit secrets.

52. DEMO DATA

Use realistic demo data for development.

Categories:

Burgers

Pizza

Chips & Sides

Soft Drinks

Other

Products:

Classic Burger

Cheese Burger

Chicken Burger

Margherita Pizza

Chicken Pizza

French Fries

Coca-Cola

Sprite

Water

Use placeholder prices where official café prices have not yet been provided.

Clearly separate demo data from production data.

53. IMPORTANT BUSINESS RULES

Implement these rules server-side:

Unavailable products cannot be ordered.

Product prices are retrieved from the backend.

Order totals are calculated/validated by the backend.

Customers can only access their own orders.

Staff can only perform authorized operational actions.

Admin functions require administrator authorization.

Payment success must be verified by the backend.

Duplicate order creation must be prevented where appropriate.

Invalid order status transitions must be rejected.

Sensitive information must never be exposed.

54. UX QUALITY

The application should feel polished.

Avoid:

generic templates

excessive cards

unnecessary gradients

tiny text

confusing navigation

inconsistent buttons

cluttered dashboards

excessive animation

placeholder-looking UI

Prioritize:

visual hierarchy

whitespace

typography

consistency

intuitive navigation

clear CTAs

useful feedback

fast interaction

55. DESIGN SYSTEM

Create reusable components:

Button

Input

Select

Modal

Card

ProductCard

CategoryCard

Badge

Toast

LoadingSpinner

EmptyState

ErrorState

Navbar

Footer

OrderStatus

OrderTimeline

DashboardCard

DataTable

Use a consistent design system throughout the application.

56. MOBILE-FIRST CUSTOMER EXPERIENCE

The customer ordering experience should be optimized primarily for mobile.

The user should be able to:

Open the website.

Immediately see the menu CTA.

Browse products.

Add a product.

Open cart.

Checkout.

Pay.

Track order.

The process should require as few unnecessary steps as possible.

57. ADMIN UX

The admin dashboard should prioritize efficiency.

Staff should be able to identify immediately:

new orders

pending orders

preparing orders

ready orders

unavailable products

payment problems

Use clear status indicators.

58. PERFORMANCE

Optimize:

images

API requests

database queries

frontend bundles

unnecessary re-renders

loading states

Lazy-load appropriate pages/components.

Use optimized image handling.

Do not sacrifice usability for unnecessary optimization.

59. SEO

For public pages implement:

meaningful page titles

meta descriptions

semantic HTML

proper headings

descriptive image alt text

clean URLs

Open Graph metadata where appropriate

Customer-facing pages should be search-engine friendly.

60. FINAL QUALITY STANDARD

Before considering the project complete, verify:

Customer

Home works

Menu works

Categories work

Products work

Cart works

Checkout works

Payment flow works

Order creation works

Order tracking works

Account works

Staff

Login works

Orders work

Status updates work

Availability management works

Admin

Dashboard works

Products work

Categories work

Users work

Promotions work if included

Settings work

Technical

Database works

APIs work

Authentication works

Authorization works

Validation works

Error handling works

Responsive behavior works

Security controls exist

Tests exist

61. IMPORTANT IMPLEMENTATION RULE

Build the project in phases.

Do NOT attempt to create every feature in one uncontrolled implementation.

Use this development order:

Phase 1

Project foundation

↓

Phase 2

Database + backend

↓

Phase 3

Authentication + authorization

↓

Phase 4

Products + categories

↓

Phase 5

Customer frontend

↓

Phase 6

Cart + checkout

↓

Phase 7

Orders + tracking

↓

Phase 8

Payments

↓

Phase 9

Staff dashboard

↓

Phase 10

Admin dashboard

↓

Phase 11

Notifications

↓

Phase 12

Testing

↓

Phase 13

Production preparation

62. DEVELOPMENT METHODOLOGY

For every feature use:

Requirement
↓
Task
↓
Feature Branch
↓
Implementation
↓
Local Testing
↓
Code Review
↓
Integration
↓
Integration Testing
↓
Merge

Use meaningful Git commits.

Example:

feat: implement product management
feat: add cart functionality
feat: implement order creation
fix: prevent unavailable products from being ordered
feat: add order tracking

63. FINAL WEBSITE EXPERIENCE

When a visitor enters the website, they should immediately understand:

What is this?

NEBA Café's digital ordering platform.

What can I do?

Browse, order, pay, and track my food.

Who built it?

ORNIX-TECH.

How was it built?

Through a professional five-stage process:

Requirements → Design → Architecture → Development → Testing & Deployment

This should be obvious from the website.

64. FINAL HERO MESSAGE

The overall brand message should communicate:

NEBA CAFÉ

Good Food. Great Moments. Simply NEBA.

A modern café ordering experience designed to make discovering, ordering, paying, and tracking your food simple.

Supporting ORNIX-TECH message:

Built professionally by ORNIX-TECH — from business requirements to real-world software.

65. FINAL REQUIREMENT

The result must be a complete, polished, responsive, production-oriented web application, not merely a collection of static pages.

Prioritize:

Functionality + UX + Architecture + Security + Maintainability + Professional Visual Design

The five-stage ORNIX-TECH process must be visible throughout the project.

The final product should demonstrate that ORNIX-TECH can take a real business problem and transform it into a professional software product:

Understand → Design → Architect → Build → Test → Deploy → Improve

## Overview

This project is a modern, responsive frontend implementation and interactive demonstration of the **NEBA Café Ordering & Management System**, powered by ORNIX-TECH. It features customer digital ordering (menu browsing, item customisation, real-time cart, multi-step checkout, and live order tracking) alongside a dedicated staff and administration operations dashboard.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
