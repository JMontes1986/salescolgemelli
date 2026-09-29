# **App Name**: Ventas ColGemelli

## Core Features:

- Ticket Issuance: Generate individual tickets with unique codes and QR codes, ensuring each ticket is marked as 'available' upon creation. Use the 'issueTicket' Cloud Function tool.
- Sales Recording: Record sales transactions by creating orders, associating tickets with the order, calculating totals, and validating ticket availability using a Cloud Function to ensure atomicity.
- Payment Confirmation: Register payments, update order statuses to 'paid,' and finalize ticket status using a Cloud Function, linking payment records to specific orders.
- Ticket Redemption: Validate QR codes to redeem tickets, updating the ticket status to 'redeemed' and creating audit logs for tracking.
- Cashbox Management: Enable opening and closing of cashboxes with consolidated totals and audit logging using Cloud Functions.
- User Role Management: Administer user roles (admin, cashier, seller, auditor, readonly) by assigning custom claims to users for permission control using a Cloud Function.
- Auditing: Automatically maintains an audit log related to sensitive transactions, such as when tickets are issued, marked as sold, marked as void, or cashed in. The logs include the user who initiated the action as well as timestamps for further forensic analysis.
- Self-Service Purchase: Allow parents to create a phone-bound reservation, pay manually with the school's Bre-B key, and report the transfer for later verification by authorized staff.

## Style Guidelines:

- Primary color: Deep blue (#3F51B5) to convey trust and reliability.
- Background color: Light gray (#F0F2F5) for a clean and professional backdrop.
- Accent color: Vibrant orange (#FF9800) to highlight key actions and CTAs, drawing attention to important elements.
- Body and headline font: 'PT Sans' for a modern, humanist feel.
- Use minimalist icons to represent actions and data, maintaining a consistent visual language throughout the application.
- Employ a grid-based layout for clear organization of data, ensuring the interface is intuitive and responsive across devices.
- Use subtle animations (e.g., transitions, loaders) to enhance user experience without being intrusive.
