# Security Specification for MedTurnos

## 1. Executive Summary & Zero-Trust Architecture
MedTurnos operates on a Zero-Trust security model for clinical and administrative management. Access control is enforced at both the Firestore security rules layer (`firestore.rules`) and the backend API server layer (`server.ts`). Hiding UI controls is never considered a security boundary.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Resource / Collection | Super Admin / Admin | Médico (Profesional) | Secretario / Staff | Paciente (Público) |
| :--- | :--- | :--- | :--- | :--- |
| `/users/{uid}` | Full Read/Write | Read/Update own doc (no privilege escalation) | Read own doc | No access |
| `/profiles/{uid}` | Full Read/Write | Read/Write own doc | Read assigned clinic's profile | No access |
| `/staff/{staffId}` | Full Read/Write | Read/Write own clinic staff | Read own staff record | No access |
| `/appointments/{id}` | Full Read/Write | Read/Write own clinic appointments | Read/Write assigned clinic appointments | Public booking endpoints only |
| `/patients/{id}` | Full Read/Write | Read/Write own patients | Read/Write clinic patients | No access |
| `/patients/{id}/evolutions/{eid}` | Full Read/Write | Read/Write own patient records | Forbidden (clinical privacy) | No access |
| `/audit_logs/{id}` | Read all / Create via API | Forbidden direct read/write | Forbidden direct read/write | No access |
| `/stocks/{id}` | Full Read/Write | Read/Write own clinic stock | Read/Write clinic stock | No access |
| `/plans/{planId}` | Full Read/Write | Read only | Read only | No access |

---

## 3. Data Invariants & Clinical State Machines

1. **Appointment Immutability upon Completion**:
   - Once an appointment reaches the status `finished` or `finalizado`, it **cannot** transition back to an earlier status (e.g. `in-session`, `confirmed`, `pendiente`, `cancelado`).
   - This invariant is enforced in:
     - `firestore.rules`:
       ```
       !(resource.data.get('status', '') in ['finished', 'finalizado']) ||
       (request.resource.data.get('status', '') in ['finished', 'finalizado'])
       ```
     - `server.ts` (`POST /api/appointments/:id/status`): Validates current status and rejects invalid state regressions with HTTP 403.
     - `Agenda.tsx`: Status buttons for prior states are disabled and the "Atender" button is completely unrendered for finished appointments.

2. **Privilege Escalation Prevention**:
   - Non-admin users updating their own user profile cannot change `role`, `paymentStatus`, or `isBlocked`.

3. **Clinical Isolation**:
   - All clinical records (`appointments`, `patients`, `evolutions`, `treatments`) are scoped by `userId` (the practitioner's ID) and verified against `canAccessData(userId)`.

4. **Immutable Security Audit Trail**:
   - All administrative actions (user management, database initialization, session revocations, role assignments) produce audit records stored in `/audit_logs` with timestamps, caller UID, client IP, action name, and modified fields.

---

## 4. The Dirty Dozen Payloads & Mitigation Specs

1. **Payload 1: Attempt to revert a Finished appointment back to In-Session via direct Firestore write**
   - *Result*: Rejected by `firestore.rules` appointment update constraint.
2. **Payload 2: Attempt to call `/api/appointments/:id/status` to revert finished appointment**
   - *Result*: Rejected with HTTP 403 Forbidden: "Operación rechazada: El turno ya se encuentra finalizado y no se permite volver a un estado anterior."
3. **Payload 3: Attempt to escalate role from `medico` to `admin` in `/users/{uid}` update**
   - *Result*: Rejected by `firestore.rules` user profile update rule.
4. **Payload 4: Attempt to view another professional's appointments**
   - *Result*: Blocked by `canAccessData(userId)` rule checking `request.auth.uid == userId || isStaffOf(userId) || isAdmin()`.
5. **Payload 5: Attempt by staff/secretary to access clinical evolutions (`/patients/{id}/evolutions/{eid}`)**
   - *Result*: Forbidden unless granted explicit clinical access; evolutions restricted to practitioner or admin.
6. **Payload 6: Attempt to delete inventory item by unauthenticated user**
   - *Result*: Blocked by `isSignedIn()` check.
7. **Payload 7: Attempt to access `/api/audit/logs` without admin privileges**
   - *Result*: Blocked by `requireAdminRole` middleware with HTTP 403 Forbidden.
8. **Payload 8: Attempt to forge audit log entry with fake caller identity**
   - *Result*: `/api/audit/log` derives `callerUid` strictly from verified Firebase ID token (`(req as any).user.uid`).
9. **Payload 9: Attempt to revoke sessions of another user**
   - *Result*: `/api/auth/revoke-sessions` extracts caller UID from the verified session token only.
10. **Payload 10: Attempt to submit weak password (< 12 chars, no special char)**
    - *Result*: Client-side validator blocks submission; server-side regex `validateServerPassword` enforces policy before updating auth.
11. **Payload 11: Attempt to read `/audit_logs` directly from client Firestore SDK without admin claim**
    - *Result*: Blocked by `isAdmin()` check in `firestore.rules`.
12. **Payload 12: Attempt to modify system subscription plans in `/plans`**
    - *Result*: Write allowed exclusively to `isAdmin()`.

---

## 5. Verification & Testing Procedure
- Security rules validated with Firebase Rules Emulator / build checks.
- API endpoints tested with valid and invalid JWT bearer tokens.
- All administrative interfaces (Audit, Security, Control Maestro) guarded on client and server.
