/*******************************************************************************
 * NU494 Course Hub — src/services/api.ts
 *
 * ไฟล์เดียวที่คุยกับหลังบ้าน  →  เปลี่ยนจากข้อมูลจำลองเป็นข้อมูลจริงที่นี่ที่เดียว
 *
 * วิธีใช้ :
 *   1. วางไฟล์นี้ทับ src/services/api.ts ในโปรเจกต์ที่ Google AI Studio สร้างให้
 *   2. สร้างไฟล์ .env.local แล้วใส่ค่า 2 บรรทัดนี้
 *        VITE_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
 *        VITE_GOOGLE_CLIENT_ID=XXXXXXXX.apps.googleusercontent.com
 *   3. ใส่ <script src="https://accounts.google.com/gsi/client" async defer></script>
 *      ไว้ใน index.html
 *   4. ตั้ง USE_MOCK = false
 ******************************************************************************/

import * as mock from './mockData';

/* ─── ค่าคอนฟิก ─────────────────────────────────────────────────────────── */

const API_URL = import.meta.env.VITE_API_URL as string;
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

/** true = ใช้ข้อมูลจำลอง (ตอนพัฒนาหน้าเว็บ) | false = ต่อกับ Apps Script จริง */
export const USE_MOCK = !API_URL;

const TOKEN_KEY = 'nu494_id_token';

/* ─── แจ้งเตือนเมื่อยังไม่ได้ตั้งค่าเชื่อมต่อ ───────────────────────────
 * ถ้า deploy ขึ้นโฮสต์จริงแล้วยังไม่ได้ใส่ VITE_API_URL หน้าเว็บจะขาวเปล่า
 * โดยไม่รู้สาเหตุ — ตรงนี้จึงขึ้นแถบบอกให้ชัดแทนที่จะเงียบ
 * ------------------------------------------------------------------- */
if (USE_MOCK && typeof document !== 'undefined' && location.hostname !== 'localhost') {
  window.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:99999;padding:12px 16px;' +
      'background:#8B1A1A;color:#fff;font:14px/1.6 system-ui,sans-serif;text-align:center';
    bar.innerHTML =
      '<b>ยังไม่ได้เชื่อมต่อระบบหลังบ้าน</b> — ' +
      'กรุณาตั้งค่า <code>VITE_API_URL</code> และ <code>VITE_GOOGLE_CLIENT_ID</code> ' +
      'ใน Environment Variables ของโฮสต์ แล้ว Redeploy อีกครั้ง';
    document.body.appendChild(bar);
  });
}

/* ─── ชนิดข้อมูลที่ใช้ร่วมกัน ─────────────────────────────────────────── */

export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUEST';
export type Visibility = 'PUBLIC' | 'ALL' | 'TEACHER_ONLY' | 'STUDENT_ONLY' | 'ADMIN_ONLY' | 'HIDDEN';
export type AccessLevel = 'PUBLIC' | 'STUDENT_VISIBLE' | 'TEACHER_ONLY' | 'ADMIN_ONLY';
export type AudienceType = 'ALL' | 'TEACHERS' | 'STUDENTS' | 'STUDENTS_OF_YEAR' | 'GROUP' | 'CUSTOM';
export type EmailTarget = 'NOT_SUBMITTED' | 'SUBMITTED' | 'ON_TIME' | 'LATE' | 'SELECTED' | 'ALL';

export interface ApiError { code: string; message: string }

export class ApiException extends Error {
  code: string;
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
    this.name = 'ApiException';
  }
}

/* ─── การจัดการโทเคน ────────────────────────────────────────────────────── */

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY) || '',
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/* ─── แกนกลางของการเรียก API ────────────────────────────────────────────── */

/**
 * เหตุผลที่ใช้ GET เป็นค่าเริ่มต้น (ไม่ใช่ POST) :
 * Apps Script Web App ตอบทุกคำขอด้วย 302 redirect ไปที่ script.googleusercontent.com
 * เสมอ ไม่ว่าเมธอดต้นทางจะเป็นอะไร — และตามสเปกของ fetch/เบราว์เซอร์ เมื่อ POST
 * เจอ redirect (301/302/303) เมธอดของคำขอที่ตามไปจะถูก "เปลี่ยนเป็น GET" ให้เอง
 * โดยอัตโนมัติ (เพื่อความเข้ากันได้แบบเดิม) ทำให้ปลายทางที่ Google บางครั้ง
 * ตอบ 404 กลับมา เพราะคำขอที่ตามไปไม่ตรงกับที่ระบบคาดไว้ — อาการนี้ตรงกับที่พบ:
 * เปิดลิงก์ /exec ตรง ๆ (GET) ได้ผลลัพธ์ปกติเสมอ แต่ fetch(POST) จาก฿เว็บ 404
 *
 * ทางแก้ : ส่งคำขอเป็น GET ทุกครั้งที่ทำได้ โดยฝัง JSON ทั้งก้อนไว้ใน query
 * string (?req=...) เพราะ GET→GET ตอน redirect ไม่มีการเปลี่ยนเมธอด จึงไม่เจอ
 * ปัญหานี้ ส่วน action ที่ payload มีขนาดใหญ่ (แนบไฟล์ / นำเข้า CSV) ที่ยัดใน
 * query string ไม่พอ (ยาวเกิน URL_SAFE_LIMIT) จะ fallback ไปใช้ POST เหมือนเดิม
 * — ถ้า Apps Script deployment ของคุณเจอปัญหา 404 กับ POST เหมือนกัน การอัปโหลด
 * ไฟล์ขนาดใหญ่อาจยังพังอยู่ ต้องแก้ที่ต้นตอ POST/redirect แยกอีกที
 */
const URL_SAFE_LIMIT = 6000; // ตัวอักษร — เผื่อระยะห่างจากขีดจำกัดความยาว URL ของเบราว์เซอร์/พร็อกซีต่าง ๆ

async function call<T = any>(action: string, payload: Record<string, any> = {}): Promise<T> {
  if (USE_MOCK) return mockCall<T>(action, payload);

  const bodyStr = JSON.stringify({ action, idToken: token.get(), payload });

  const res = bodyStr.length > URL_SAFE_LIMIT
    ? await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: bodyStr,
        redirect: 'follow',
      })
    : await fetch(API_URL + '?req=' + encodeURIComponent(bodyStr), {
        method: 'GET',
        redirect: 'follow',
      });

  if (!res.ok) {
    throw new ApiException({ code: 'NETWORK_ERROR', message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (HTTP ' + res.status + ')' });
  }

  const json = await res.json();
  if (!json.ok) {
    // เซสชันหมดอายุ → เคลียร์โทเคนเพื่อให้หน้าเว็บพากลับไปล็อกอินใหม่
    if (['INVALID_TOKEN', 'TOKEN_EXPIRED', 'UNAUTHENTICATED'].includes(json.error?.code)) {
      token.clear();
    }
    throw new ApiException(json.error || { code: 'UNKNOWN', message: 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ' });
  }

  // เก็บส่วนต่างเวลาเครื่องกับเซิร์ฟเวอร์ไว้ใช้นับถอยหลังให้ตรง
  if (json.serverTime) syncServerClock(json.serverTime);
  return json.data as T;
}

/* ─── นาฬิกาเซิร์ฟเวอร์ ────────────────────────────────────────────────── */

let clockOffsetMs = 0;

function syncServerClock(serverIso: string) {
  const server = new Date(serverIso).getTime();
  if (!isNaN(server)) clockOffsetMs = server - Date.now();
}

/**
 * เวลาปัจจุบันตามเซิร์ฟเวอร์ — ใช้ตัวนี้กับการนับถอยหลังและป้ายสถานะทุกที่
 * หมายเหตุ : ใช้เพื่อ "แสดงผล" เท่านั้น การตัดสินทันเวลา/เกินเวลาจริง
 *            เกิดขึ้นฝั่งเซิร์ฟเวอร์เสมอ หน้าเว็บไม่มีสิทธิ์ตัดสิน
 */
export function serverNow(): Date {
  return new Date(Date.now() + clockOffsetMs);
}

/* ─── การแปลงไฟล์เป็น base64 สำหรับอัปโหลด ─────────────────────────────── */

export interface UploadFile {
  name: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
}

export function fileToUpload(file: File): Promise<UploadFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64: result.split(',')[1] || '',
        sizeBytes: file.size,
      });
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ "' + file.name + '" ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

/* ─── Google Sign-In ────────────────────────────────────────────────────── */

declare global { interface Window { google?: any } }

/** เรียกครั้งเดียวตอนแอปเริ่มทำงาน เพื่อเตรียมปุ่มล็อกอิน */
export function initGoogleSignIn(onSignedIn: (idToken: string) => void) {
  if (USE_MOCK) return;
  const g = window.google;
  if (!g?.accounts?.id) {
    console.warn('ยังโหลดสคริปต์ Google Identity ไม่เสร็จ');
    return;
  }
  g.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp: any) => {
      token.set(resp.credential);
      onSignedIn(resp.credential);
    },
    auto_select: true,
  });
}

/** วาดปุ่ม "ลงชื่อเข้าใช้ด้วย Google" ลงใน element ที่กำหนด */
export function renderGoogleButton(el: HTMLElement) {
  if (USE_MOCK) return;
  window.google?.accounts?.id?.renderButton(el, {
    theme: 'filled_blue', size: 'large', shape: 'pill',
    text: 'signin_with', locale: 'th',
  });
}

export function signOut() {
  token.clear();
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
}

/* ══════════════════════════════════════════════════════════════════════════
 *  API — จัดกลุ่มให้ตรงกับหน้าจอที่เรียกใช้
 * ════════════════════════════════════════════════════════════════════════ */

export const api = {

  /** โหลดทุกอย่างที่หน้าเว็บต้องใช้ตอนเปิด (เมนู ตั้งค่า ลิงก์ Classroom ผู้ใช้) */
  bootstrap: () => call('bootstrap.get'),

  auth: {
    me: () => call('auth.me'),
  },

  menus: {
    list: () => call('menus.list'),
    save: (menus: any[], deleteIds: string[] = []) => call('menus.save', { menus, deleteIds }),
  },

  content: {
    get: (pageKey?: string) => call('content.get', { pageKey }),
    save: (pageKey: string, blocks: any[], deleteIds: string[] = []) =>
      call('content.save', { pageKey, blocks, deleteIds }),
  },

  news: {
    list: (params: { category?: string; limit?: number } = {}) => call('news.list', params),
    get: (id: string) => call('news.get', { id }),
    save: (news: any) => call('news.save', news),
    remove: (id: string) => call('news.delete', { id }),
    markRead: (id: string) => call('news.markRead', { id }),
  },

  library: {
    folders: () => call('folders.list'),
    saveFolder: (folder: any) => call('folders.save', folder),
    files: (folderId?: string) => call('files.list', { folderId }),
    /** อัปโหลดไฟล์เข้าคลัง — accessLevel เป็นตัวกำหนดว่าใครเห็นไฟล์นี้ */
    upload: (files: UploadFile[], opts: {
      accessLevel: AccessLevel; folderId?: string; description?: string; tags?: string[];
    }) => call('files.upload', { files, ...opts }),
    /** ขอสิทธิ์ดาวน์โหลด — เซิร์ฟเวอร์ตรวจสิทธิ์ทุกครั้งก่อนคืนลิงก์ */
    getDownloadUrl: (id: string) => call('files.getDownloadUrl', { id }),
    remove: (id: string) => call('files.delete', { id }),
  },

  classroom: {
    list: () => call('classroom.list'),
    save: (links: any[], deleteIds: string[] = []) => call('classroom.save', { links, deleteIds }),
  },

  users: {
    list: (filter: { role?: Role; academicYearId?: string; groupId?: string; q?: string } = {}) =>
      call('users.list', filter),
    save: (user: any) => call('users.save', user),
    /** dryRun = true เพื่อดูผลก่อนยืนยันนำเข้าจริง */
    importCsv: (csv: string, role: Role = 'STUDENT', dryRun = false) =>
      call('users.importCsv', { csv, role, dryRun }),
    archiveYear: (academicYearId: string) => call('users.archiveYear', { academicYearId }),
  },

  assignments: {
    list: (academicYearId?: string) => call('assignments.list', { academicYearId }),
    get: (id: string) => call('assignments.get', { id }),
    save: (assignment: any) => call('assignments.save', assignment),
    close: (id: string, reopen = false) => call('assignments.close', { id, reopen }),
  },

  submissions: {
    /** ส่งงาน — แนบได้หลายไฟล์ในครั้งเดียว */
    submit: (assignmentId: string, files: UploadFile[], note = '') =>
      call('submissions.submit', { assignmentId, files, note }),
    mine: () => call('submissions.mine'),
    byAssignment: (assignmentId: string) => call('submissions.byAssignment', { assignmentId }),
    grade: (submissionId: string, score?: number | string, feedback?: string) =>
      call('submissions.grade', { submissionId, score, feedback }),
  },

  reports: {
    /** สรุป + รายชื่อทุกคน พร้อมสถานะ ทันเวลา / เกินเวลา / ยังไม่ส่ง */
    assignment: (assignmentId: string) => call('reports.assignmentSummary', { assignmentId }),
    csv: (assignmentId: string) => call('reports.exportCsv', { assignmentId }),
  },

  email: {
    templates: () => call('email.templates'),
    saveTemplate: (tpl: any) => call('email.saveTemplate', tpl),
    /** ดูรายชื่อผู้รับและตัวอย่างอีเมลก่อนส่งจริง */
    preview: (params: {
      assignmentId: string; target: EmailTarget; templateKey?: string;
      subject?: string; bodyHtml?: string; studentRowIds?: string[];
    }) => call('email.preview', params),
    /** ส่งจริง — เซิร์ฟเวอร์คำนวณผู้รับเองจาก target ไม่รับรายชื่ออีเมลจากหน้าเว็บ */
    send: (params: {
      assignmentId: string; target: EmailTarget; templateKey?: string;
      subject?: string; bodyHtml?: string; studentRowIds?: string[];
      excludeIds?: string[]; ccTeacher?: boolean; attachmentFileIds?: string[];
    }) => call('email.send', params),
    logs: (assignmentId?: string) => call('email.logs', { assignmentId }),
    quota: () => call('email.quota'),
  },

  events: {
    list: (academicYearId?: string) => call('events.list', { academicYearId }),
    save: (event: any) => call('events.save', event),
    remove: (id: string) => call('events.delete', { id }),
  },

  settings: {
    get: () => call('settings.get'),
    save: (settings: Record<string, string>) => call('settings.save', { settings }),
  },

  ack: {
    save: (type: 'SIM_SAFETY' | 'SIM_CONFIDENTIAL' | 'READINESS') => call('ack.save', { type }),
    status: () => call('ack.status'),
  },
};

/* ─── ตัวช่วยดาวน์โหลดไฟล์ CSV ที่ได้จาก reports.csv ──────────────────── */

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── โหมดข้อมูลจำลอง ───────────────────────────────────────────────────── */

/**
 * action ที่ต้องคืนค่าเป็น "อาร์เรย์" เสมอ
 * ถ้าคืน {} ไปแทน หน้าเว็บจะพังทันทีที่เรียก .map() หรือ .filter()
 * (นี่คือสาเหตุของอาการ "s.filter is not a function" จอขาวทั้งหน้า)
 */
const LIST_ACTIONS = [
  'menus.list', 'content.get', 'news.list', 'folders.list', 'files.list',
  'classroom.list', 'users.list', 'assignments.list', 'submissions.mine',
  'submissions.byAssignment', 'email.templates', 'email.logs', 'events.list',
];

/** ค่าว่างที่ปลอดภัยสำหรับแต่ละ action เมื่อยังไม่มีข้อมูลจำลอง */
function safeEmpty<T>(action: string): T {
  if (LIST_ACTIONS.includes(action)) return [] as unknown as T;

  switch (action) {
    case 'bootstrap.get':
      return {
        user: null, role: 'GUEST', menus: [], settings: {},
        classroomLinks: [], academicYears: [], currentYearId: '',
        serverTime: new Date().toISOString(),
      } as unknown as T;

    case 'reports.assignmentSummary':
      return {
        assignment: null,
        summary: { total: 0, submitted: 0, onTime: 0, late: 0, pending: 0, percent: 0 },
        rows: [],
      } as unknown as T;

    case 'auth.me':
      return { user: null, permissions: {}, currentYearId: '' } as unknown as T;

    default:
      return {} as T;
  }
}

async function mockCall<T>(action: string, payload: any): Promise<T> {
  await new Promise((r) => setTimeout(r, 150));   // จำลองความหน่วงของเครือข่าย
  const fn = (mock as any)[action.replace('.', '_')];
  if (typeof fn === 'function') return fn(payload);
  console.warn('[mock] ยังไม่มีข้อมูลจำลองสำหรับ action:', action, '— คืนค่าว่างแทน');
  return safeEmpty<T>(action);
}

export default api;