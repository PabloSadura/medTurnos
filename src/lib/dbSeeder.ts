import { db, auth } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export async function seedAllCollections() {
  const currentUserId = auth.currentUser?.uid || 'admin_root';
  const currentUserEmail = auth.currentUser?.email || 'admin@mail.com';

  const results: Record<string, number> = {};

  try {
    // 1. PLANS
    const plansData = [
      { id: 'basico', name: 'Básicos', usersLimit: 1, secretariesLimit: 1, whatsappCredit: 100, price: 19 },
      { id: 'plus', name: 'Plus', usersLimit: 3, secretariesLimit: 2, whatsappCredit: 500, price: 39 },
      { id: 'premium', name: 'Premium', usersLimit: 10, secretariesLimit: 5, whatsappCredit: 2000, price: 79 }
    ];
    for (const p of plansData) {
      await setDoc(doc(db, 'plans', p.id), {
        name: p.name,
        usersLimit: p.usersLimit,
        secretariesLimit: p.secretariesLimit,
        whatsappCredit: p.whatsappCredit,
        price: p.price,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    results['plans'] = plansData.length;

    // 2. USERS
    // Admin user document
    await setDoc(doc(db, 'users', currentUserId), {
      email: currentUserEmail,
      name: 'Administrador del Sistema',
      role: 'admin',
      status: 'Activo',
      specialty: 'Dirección Médica y Gestión',
      phone: '+54 9 11 1234-5678',
      activePlanId: 'premium',
      whatsappCredit: 2000,
      schedule: {
        workingDays: [1, 2, 3, 4, 5],
        morningStart: '08:00',
        morningEnd: '12:00',
        morningActive: true,
        afternoonStart: '14:00',
        afternoonEnd: '18:00',
        afternoonActive: true
      },
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Sample Doctor user document
    await setDoc(doc(db, 'users', 'prof_demo_01'), {
      email: 'doctor@demo.com',
      name: 'Dr. Alejandro Morales',
      role: 'medico',
      status: 'Activo',
      specialty: 'Odontología General',
      phone: '+54 9 11 2345-6789',
      activePlanId: 'plus',
      whatsappCredit: 500,
      schedule: {
        workingDays: [1, 2, 3, 4, 5],
        morningStart: '08:30',
        morningEnd: '12:30',
        morningActive: true,
        afternoonStart: '14:30',
        afternoonEnd: '19:00',
        afternoonActive: true
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    results['users'] = 2;

    // 3. PATIENTS & EVOLUTIONS
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Patient 1
    const patientDocRef1 = doc(db, 'patients', 'pat_demo_01');
    await setDoc(patientDocRef1, {
      userId: currentUserId,
      name: 'Lucía Fernández',
      idNumber: '38.452.190',
      dni: '38.452.190',
      phone: '+54 9 11 9876-5432',
      email: 'lucia.fernandez@example.com',
      gender: 'Female',
      birthDate: '1994-06-15',
      address: 'Av. Libertador 1234',
      bloodType: 'O+',
      allergies: 'Penicilina',
      medicalInsurance: 'OSDE 210',
      affiliateNumber: '19827461-01',
      status: 'active',
      lastVisit: todayStr,
      notes: 'Paciente en tratamiento preventivo',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Evolution 1
    const evoData1 = {
      id: 'evo_demo_01',
      patientId: 'pat_demo_01',
      patientName: 'Lucía Fernández',
      userId: currentUserId,
      doctorId: currentUserId,
      date: todayStr,
      doctor: 'Dr. Alejandro Morales',
      treatment: 'Consulta General / Diagnóstico',
      treatmentId: 'treat_demo_01',
      cost: 4500,
      note: 'Evaluación periódica y profilaxis completa. Favorable.',
      status: 'Completed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, 'patients', 'pat_demo_01', 'evolutions', 'evo_demo_01'), evoData1, { merge: true });
    await setDoc(doc(db, 'evolutions', 'evo_demo_01'), evoData1, { merge: true });
    results['evolutions'] = 1;

    // Patient 2
    const patientDocRef2 = doc(db, 'patients', 'pat_demo_02');
    await setDoc(patientDocRef2, {
      userId: currentUserId,
      name: 'Carlos Gómez',
      idNumber: '35.129.804',
      dni: '35.129.804',
      phone: '+54 9 11 4567-8901',
      email: 'carlos.gomez@example.com',
      gender: 'Male',
      birthDate: '1990-03-22',
      address: 'Calle San Martín 560',
      bloodType: 'A+',
      allergies: 'Ninguna',
      medicalInsurance: 'Swiss Medical',
      affiliateNumber: '8827391-00',
      status: 'active',
      lastVisit: todayStr,
      notes: 'Control de rutina programado',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    results['patients'] = 2;

    // 4. TREATMENTS
    await setDoc(doc(db, 'treatments', 'treat_demo_01'), {
      userId: currentUserId,
      name: 'Consulta General / Diagnóstico',
      cost: 15000,
      duration: 30,
      materials: [
        { id: 'stock_demo_01', name: 'Guantes de Nitrilo', quantity: 1 }
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'treatments', 'treat_demo_02'), {
      userId: currentUserId,
      name: 'Tratamiento Especializado',
      cost: 35000,
      duration: 45,
      materials: [
        { id: 'stock_demo_01', name: 'Guantes de Nitrilo', quantity: 2 },
        { id: 'stock_demo_02', name: 'Barbijos Quirúrgicos', quantity: 1 }
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    results['treatments'] = 2;

    // 5. STOCKS & MOVEMENTS
    await setDoc(doc(db, 'stocks', 'stock_demo_01'), {
      userId: currentUserId,
      name: 'Guantes de Nitrilo (Caja x 100)',
      stock: 45,
      minStock: 10,
      price: 8500,
      unit: 'cajas',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'stocks', 'stock_demo_01', 'movements', 'mov_demo_01'), {
      userId: currentUserId,
      type: 'in',
      quantity: 50,
      reason: 'Ingreso inicial de stock',
      date: todayStr,
      createdAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'stocks', 'stock_demo_02'), {
      userId: currentUserId,
      name: 'Barbijos Quirúrgicos (Caja x 50)',
      stock: 30,
      minStock: 8,
      price: 4200,
      unit: 'cajas',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    results['stocks'] = 2;

    // 6. APPOINTMENTS
    const startHour1 = new Date();
    startHour1.setHours(10, 0, 0, 0);

    const startHour2 = new Date();
    startHour2.setHours(11, 30, 0, 0);

    await setDoc(doc(db, 'appointments', 'app_demo_01'), {
      userId: currentUserId,
      patientId: 'pat_demo_01',
      patientName: 'Lucía Fernández',
      date: todayStr,
      time: '10:00',
      type: 'Consulta General / Diagnóstico',
      treatment: 'Consulta General / Diagnóstico',
      status: 'confirmado',
      duration: 30,
      notes: 'Primera consulta médica del mes',
      startTime: startHour1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'appointments', 'app_demo_02'), {
      userId: currentUserId,
      patientId: 'pat_demo_02',
      patientName: 'Carlos Gómez',
      date: todayStr,
      time: '11:30',
      type: 'Tratamiento Especializado',
      treatment: 'Tratamiento Especializado',
      status: 'pendiente',
      duration: 45,
      notes: 'Control periódico y seguimiento',
      startTime: startHour2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    results['appointments'] = 2;

    // 7. REMINDER SETTINGS
    await setDoc(doc(db, 'reminder_settings', currentUserId), {
      userId: currentUserId,
      template: 'Hola {nombre}, te recordamos tu turno el {fecha} a las {hora} para su {tratamiento}. ¡Te esperamos!',
      botEnabled: false,
      rules: [
        { label: '24h Antes (Recordatorio)', active: true },
        { label: '1h Antes (Alerta Final)', active: true },
        { label: 'Seguimiento (Post 2 días)', active: false },
        { label: 'Saludo Cumpleaños', active: true }
      ],
      updatedAt: serverTimestamp()
    }, { merge: true });
    results['reminder_settings'] = 1;

    // 8. STAFF
    await setDoc(doc(db, 'staff', 'staff_demo_01'), {
      userId: currentUserId,
      name: 'Valeria Rossi',
      email: 'secretaria@demo.com',
      role: 'Secretary',
      status: 'Activo',
      permissions: ['dashboard', 'agenda', 'patients', 'reminders'],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    results['staff'] = 1;

    // 9. WHATSAPP LOGS
    await setDoc(doc(db, 'whatsapp_logs', 'log_demo_01'), {
      userId: currentUserId,
      to: '+54 9 11 9876-5432',
      patientName: 'Lucía Fernández',
      message: `Hola Lucía Fernández, te recordamos tu turno el Hoy a las 10:00. ¡Te esperamos!`,
      status: 'success',
      method: 'manual',
      createdAt: serverTimestamp()
    }, { merge: true });
    results['whatsapp_logs'] = 1;

    return { success: true, results };
  } catch (error: any) {
    console.error("Error al sembrar colecciones en Firestore:", error);
    throw error;
  }
}
