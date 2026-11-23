/**
 * Seeds demo accounts (one per role) and two sample applications.
 * Safe to re-run: users are upserted, sample data is only created once.
 *
 *   admin@lms.test      / Admin@1234
 *   officer@lms.test    / Officer@1234
 *   applicant@lms.test  / Applicant@1234
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || 'uploads');

const USERS = [
  { name: 'Asha Admin', email: 'admin@lms.test', password: 'Admin@1234', role: 'ADMIN' },
  { name: 'Omar Officer', email: 'officer@lms.test', password: 'Officer@1234', role: 'OFFICER' },
  { name: 'Riya Sharma', email: 'applicant@lms.test', password: 'Applicant@1234', role: 'APPLICANT' },
];

// A tiny valid PDF so document preview works out of the box.
const samplePdf = (title) =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 30 70 Td (${title}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );

async function addDoc(applicationId, userId, type, title) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  const storedName = `${crypto.randomUUID()}.pdf`;
  const buf = samplePdf(title);
  fs.writeFileSync(path.join(UPLOAD_ROOT, storedName), buf);
  await prisma.document.create({
    data: {
      applicationId,
      type,
      originalName: `${title.toLowerCase().replaceAll(' ', '-')}.pdf`,
      storedName,
      mimeType: 'application/pdf',
      size: buf.length,
      uploadedById: userId,
    },
  });
}

async function main() {
  const users = {};
  for (const u of USERS) {
    users[u.role] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) },
    });
  }
  const applicant = users.APPLICANT;

  if ((await prisma.loanApplication.count({ where: { applicantId: applicant.id } })) === 0) {
    const submitted = await prisma.loanApplication.create({
      data: {
        applicantId: applicant.id,
        status: 'SUBMITTED',
        currentStep: 5,
        fullName: 'Riya Sharma',
        dateOfBirth: new Date('1994-06-15'),
        panNumber: 'ABCPS1234K',
        addressLine: '12, MG Road, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        loanType: 'VEHICLE',
        amount: 800000,
        tenureMonths: 60,
        purpose: 'Purchase of a new hatchback car',
        interestRate: 9.5,
        monthlyIncome: 85000,
        employmentType: 'SALARIED',
        employerName: 'Infosys Ltd',
        submittedAt: new Date(),
        history: {
          create: [
            { toStatus: 'DRAFT', action: 'CREATE', changedById: applicant.id },
            { fromStatus: 'DRAFT', toStatus: 'SUBMITTED', action: 'SUBMIT', changedById: applicant.id },
          ],
        },
      },
    });
    await addDoc(submitted.id, applicant.id, 'ID_PROOF', 'PAN Card - Riya Sharma');
    await addDoc(submitted.id, applicant.id, 'INCOME_PROOF', 'Salary Slip - Oct 2026');

    await prisma.loanApplication.create({
      data: {
        applicantId: applicant.id,
        status: 'DRAFT',
        currentStep: 2,
        fullName: 'Riya Sharma',
        dateOfBirth: new Date('1994-06-15'),
        panNumber: 'ABCPS1234K',
        addressLine: '12, MG Road, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        loanType: 'PERSONAL',
        history: { create: { toStatus: 'DRAFT', action: 'CREATE', changedById: applicant.id } },
      },
    });
  }
  console.log('Seed complete:', USERS.map((u) => `${u.email} / ${u.password}`).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
