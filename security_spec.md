# Security Specification for MedTurnos

## Data Invariants
1. Appointments must belong to a registered professional (user).
2. Patients can only be accessed by authenticated medical professionals.
3. Inventory changes should be tracked (though currently client-side simplified).
4. User profiles are private and only the owner can modify their own profile.

## The Dirty Dozen Payloads
1. Attempt to create appointment for a different professional ID.
2. Attempt to read appointments of another professional.
3. Attempt to update a patient record without being logged in.
4. Attempt to delete an inventory item by an unauthorized user.
5. Attempt to modify someone else's professional user profile.
6. Attempt to create a patient with a massive name string (>1MB).
7. Attempt to set an appointment date in the far past (integrity check).
8. Attempt to bypass `isAdmin` check for administrative collections.
9. Attempt to read clinical history of a patient without professional matching.
10. Attempt to inject scripts into patient notes.
11. Attempt to create an appointment with an invalid status.
12. Attempt to list all users without being an admin.

## Implementation Detail
- Professional-level isolation (Users only see their own data or their clinic's data).
- Strict schema validation for all writes.
