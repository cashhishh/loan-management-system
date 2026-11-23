/**
 * Integration test: full loan lifecycle through the real HTTP API and a real
 * PostgreSQL test database (DATABASE_URL from .env.test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();
const api = () => request(app);
const PDF = Buffer.from('%PDF-1.4\n%test\n');

async function makeUser(role, email) {
  await prisma.user.create({
    data: { name: `${role} user`, email, role, passwordHash: await bcrypt.hash('Passw0rd!', 4) },
  });
  const res = await api().post('/api/v1/auth/login').send({ email, password: 'Passw0rd!' });
  return res.body.accessToken;
}

let applicantToken;
let officerToken;
let officer2Token;
let adminToken;
let appId;

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Installment","StatusHistory","Document","LoanApplication","RefreshToken","User" CASCADE',
  );
  officerToken = await makeUser('OFFICER', 'officer@test.io');
  officer2Token = await makeUser('OFFICER', 'officer2@test.io');
  adminToken = await makeUser('ADMIN', 'admin@test.io');
});

afterAll(() => prisma.$disconnect());

describe('auth', () => {
  it('registers an applicant and sets a refresh cookie', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Test Applicant', email: 'App@Test.io', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('APPLICANT');
    expect(res.body.user.email).toBe('app@test.io');
    expect(res.headers['set-cookie'][0]).toMatch(/lms_rt=.*HttpOnly/);
    applicantToken = res.body.accessToken;
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const weak = await api().post('/api/v1/auth/register').send({ name: 'X Y', email: 'x@test.io', password: 'short' });
    expect(weak.status).toBe(400);
    const dup = await api().post('/api/v1/auth/register').send({ name: 'X Y', email: 'app@test.io', password: 'secret123' });
    expect(dup.status).toBe(409);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const login = await api().post('/api/v1/auth/login').send({ email: 'app@test.io', password: 'secret123' });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const first = await api().post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();
    const replay = await api().post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);
  });

  it('enforces roles', async () => {
    expect((await api().get('/api/v1/users')).status).toBe(401);
    expect((await api().get('/api/v1/users').auth(applicantToken, { type: 'bearer' })).status).toBe(403);
    expect((await api().get('/api/v1/users').auth(adminToken, { type: 'bearer' })).status).toBe(200);
  });
});

describe('loan lifecycle', () => {
  const as = (token) => ({
    get: (url) => api().get(url).auth(token, { type: 'bearer' }),
    post: (url) => api().post(url).auth(token, { type: 'bearer' }),
    patch: (url) => api().patch(url).auth(token, { type: 'bearer' }),
  });

  it('applicant saves a draft step by step', async () => {
    const create = await as(applicantToken).post('/api/v1/applications').send({ fullName: 'Test Applicant' });
    expect(create.status).toBe(201);
    expect(create.body.data.status).toBe('DRAFT');
    appId = create.body.data.id;

    const patch = await as(applicantToken)
      .patch(`/api/v1/applications/${appId}`)
      .send({
        dateOfBirth: '1990-04-10',
        panNumber: 'abcde1234f',
        addressLine: '221B Baker Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        loanType: 'PERSONAL',
        amount: 300000,
        tenureMonths: 24,
        purpose: 'Home renovation',
        monthlyIncome: 90000,
        employmentType: 'SALARIED',
        currentStep: 4,
      });
    expect(patch.status).toBe(200);
    expect(patch.body.data.panNumber).toBe('ABCDE1234F');
  });

  it('officers cannot see drafts', async () => {
    expect((await as(officerToken).get(`/api/v1/applications/${appId}`)).status).toBe(404);
  });

  it('submission requires documents', async () => {
    const res = await as(applicantToken).post(`/api/v1/applications/${appId}/actions`).send({ action: 'SUBMIT' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d) => d.path === 'documents')).toBe(true);
  });

  it('rejects files whose content does not match their type', async () => {
    const res = await as(applicantToken)
      .post(`/api/v1/applications/${appId}/documents`)
      .field('type', 'ID_PROOF')
      .attach('file', Buffer.from('not a pdf'), { filename: 'id.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('uploads documents and submits', async () => {
    for (const type of ['ID_PROOF', 'INCOME_PROOF']) {
      const res = await as(applicantToken)
        .post(`/api/v1/applications/${appId}/documents`)
        .field('type', type)
        .attach('file', PDF, { filename: `${type}.pdf`, contentType: 'application/pdf' });
      expect(res.status).toBe(201);
    }
    const res = await as(applicantToken).post(`/api/v1/applications/${appId}/actions`).send({ action: 'SUBMIT' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
    expect(res.body.data.interestRate).toBe(12.5);
  });

  it('applicant cannot review their own application', async () => {
    const res = await as(applicantToken).post(`/api/v1/applications/${appId}/actions`).send({ action: 'START_REVIEW' });
    expect(res.status).toBe(403);
  });

  it('officer queue is filterable and paginated', async () => {
    const res = await as(officerToken).get('/api/v1/applications?status=SUBMITTED&loanType=PERSONAL&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 5, total: 1 });
    const none = await as(officerToken).get('/api/v1/applications?loanType=HOME');
    expect(none.body.meta.total).toBe(0);
  });

  it('officer reviews, requests info, applicant responds', async () => {
    let res = await as(officerToken).post(`/api/v1/applications/${appId}/actions`).send({ action: 'START_REVIEW' });
    expect(res.body.data.status).toBe('UNDER_REVIEW');

    // A different officer cannot act on someone else's review
    res = await as(officer2Token)
      .post(`/api/v1/applications/${appId}/actions`)
      .send({ action: 'REQUEST_INFO', note: 'x' });
    expect(res.status).toBe(403);

    res = await as(officerToken).post(`/api/v1/applications/${appId}/actions`).send({ action: 'REQUEST_INFO' });
    expect(res.status).toBe(400); // note required

    res = await as(officerToken)
      .post(`/api/v1/applications/${appId}/actions`)
      .send({ action: 'REQUEST_INFO', note: 'Please upload last 3 months bank statement' });
    expect(res.body.data.status).toBe('MORE_INFO_NEEDED');

    const view = await as(applicantToken).get(`/api/v1/applications/${appId}`);
    expect(view.body.data.history.at(-1).note).toContain('bank statement');

    await as(applicantToken)
      .post(`/api/v1/applications/${appId}/documents`)
      .field('type', 'OTHER')
      .attach('file', PDF, { filename: 'bank.pdf', contentType: 'application/pdf' });
    res = await as(applicantToken)
      .post(`/api/v1/applications/${appId}/actions`)
      .send({ action: 'RESPOND', note: 'Uploaded bank statement' });
    expect(res.body.data.status).toBe('SUBMITTED');
  });

  it('officer must run eligibility before recommending', async () => {
    await as(officerToken).post(`/api/v1/applications/${appId}/actions`).send({ action: 'START_REVIEW' });
    // eligibility was never run on this application
    await prisma.loanApplication.update({ where: { id: appId }, data: { eligibility: null } });
    let res = await as(officerToken)
      .post(`/api/v1/applications/${appId}/actions`)
      .send({ action: 'RECOMMEND_APPROVAL', note: 'Looks good' });
    expect(res.status).toBe(422);

    res = await as(officerToken).post(`/api/v1/applications/${appId}/eligibility`);
    expect(res.status).toBe(200);
    expect(res.body.data.passed).toBe(true);

    res = await as(officerToken)
      .post(`/api/v1/applications/${appId}/actions`)
      .send({ action: 'RECOMMEND_APPROVAL', note: 'All checks pass' });
    expect(res.body.data.status).toBe('RECOMMENDED_APPROVAL');

    // Applicant only sees "under review" and no internal notes
    const view = await as(applicantToken).get(`/api/v1/applications/${appId}`);
    expect(view.body.data.status).toBe('UNDER_REVIEW');
    expect(view.body.data.eligibility).toBeUndefined();
  });

  it('officer cannot give final approval; admin can, and an EMI schedule is generated', async () => {
    let res = await as(officerToken)
      .post(`/api/v1/applications/${appId}/actions`)
      .send({ action: 'APPROVE', note: 'x' });
    expect(res.status).toBe(403);

    res = await as(adminToken)
      .post(`/api/v1/applications/${appId}/actions`)
      .send({ action: 'APPROVE', note: 'Approved as recommended' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');

    // Double approval is a conflict
    res = await as(adminToken).post(`/api/v1/applications/${appId}/actions`).send({ action: 'APPROVE', note: 'again' });
    expect(res.status).toBe(409);

    const schedule = await as(applicantToken).get(`/api/v1/applications/${appId}/schedule`);
    expect(schedule.status).toBe(200);
    expect(schedule.body.data).toHaveLength(24);
    expect(schedule.body.data.at(-1).balance).toBe(0);
    expect(schedule.body.summary.emi).toBe(14192.19);
  });

  it('admin marks an EMI as paid; applicant cannot', async () => {
    expect(
      (await as(applicantToken).patch(`/api/v1/applications/${appId}/schedule/1`).send({ status: 'PAID' })).status,
    ).toBe(403);
    const res = await as(adminToken).patch(`/api/v1/applications/${appId}/schedule/1`).send({ status: 'PAID' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PAID');
  });

  it('records a full audit trail', async () => {
    const rows = await prisma.statusHistory.findMany({ where: { applicationId: appId }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.action)).toEqual([
      'CREATE',
      'SUBMIT',
      'START_REVIEW',
      'REQUEST_INFO',
      'RESPOND',
      'START_REVIEW',
      'RECOMMEND_APPROVAL',
      'APPROVE',
    ]);
    expect(rows.every((r) => r.changedById)).toBe(true);
  });

  it('exports CSV', async () => {
    const res = await as(applicantToken).get(`/api/v1/applications/${appId}/export?format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Installment,Due date');
  });

  it('returns 404 for other users and unknown routes', async () => {
    const other = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Other Person', email: 'other@test.io', password: 'secret123' });
    expect((await as(other.body.accessToken).get(`/api/v1/applications/${appId}`)).status).toBe(404);
    expect((await api().get('/api/v1/nope')).status).toBe(404);
  });
});
