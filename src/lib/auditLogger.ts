import { auth, db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface AuditLogPayload {
  action: string;
  section: string;
  details: string;
  changes?: Record<string, any>;
  targetId?: string;
}

export async function logAuditEvent(payload: AuditLogPayload): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const token = await currentUser.getIdToken();
    const response = await fetch('/api/audit/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // Fallback to direct Firestore write
      await addDoc(collection(db, 'audit_logs'), {
        authorId: currentUser.uid,
        authorEmail: currentUser.email || 'anon@medturnos.com',
        authorName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Usuario',
        authorRole: currentUser.email === 'pablosadura@gmail.com' ? 'admin' : 'profesional',
        action: payload.action,
        section: payload.section,
        details: payload.details,
        changes: payload.changes || {},
        targetId: payload.targetId || currentUser.uid,
        createdAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });
    }
  } catch (err) {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        authorId: currentUser.uid,
        authorEmail: currentUser.email || 'anon@medturnos.com',
        authorName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Usuario',
        authorRole: currentUser.email === 'pablosadura@gmail.com' ? 'admin' : 'profesional',
        action: payload.action,
        section: payload.section,
        details: payload.details,
        changes: payload.changes || {},
        targetId: payload.targetId || currentUser.uid,
        createdAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });
    } catch {
      // Gracefully silent on transient network offline
    }
  }
}
