# Specification: Credits System Instead of Direct Mapping

## Overview
Replace the current flat-rate (1 certificate = 1 Rs) system with a flexible credits-based system where users purchase credits via recharge, and different actions consume configurable amounts of credits.

## Functional Requirements

### 1. Credits Configuration (via Environment Variables)
- **CREDITS_PER_RUPEE**: Ratio of credits received per Rupee (e.g., `10` means Rs.1 = 10 credits)
- **CREDIT_COST_GENERATION**: Credits consumed per certificate generation
- **CREDIT_COST_EMAIL**: Credits consumed per email delivery
- **CREDIT_COST_WHATSAPP**: Credits consumed per WhatsApp delivery
- **MIN_RECHARGE_AMOUNT**: Minimum recharge amount in Rs. (default: `100`)

### 2. Recharge Flow
- Users top up their wallet via Cashfree Payment Gateway
- Minimum recharge amount enforced (Rs. 100)
- Credits are calculated: `Credits = Recharge Amount × CREDITS_PER_RUPEE`
- Credits are non-expiring and non-refundable

### 3. Credit Consumption
- **Certificate Generation**: Deducts `CREDIT_COST_GENERATION` credits per certificate
- **Email Delivery**: Deducts `CREDIT_COST_EMAIL` credits per email sent
- **WhatsApp Delivery**: Deducts `CREDIT_COST_WHATSAPP` credits per WhatsApp sent
- Credits are checked before each action; insufficient credits block the action

### 4. Audit Trail
- Log each credit transaction (recharge, consumption, balance)
- Show credit usage history in user dashboard

## Acceptance Criteria
1. Environment variables control all credit-related values
2. Recharge creates correct credit balance
3. Each action deducts the correct credit amount
4. Insufficient credits prevent the action from proceeding
5. Credit balance is always accurate and consistent

## Out of Scope
- Credit expiry mechanism
- Refund processing
- Team/organization credit pools