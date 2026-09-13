function doGet(e) {
  // If there's a req parameter, process it just like doPost
  if (e && e.parameter && e.parameter.req) {
    var started = Date.now();
    var body = {};
    try {
      body = JSON.parse(e.parameter.req);
    } catch (parseErr) {
      return json_({ ok: false, error: { code: 'BAD_REQUEST', message: 'รูปแบบคำขอไม่ถูกต้อง (GET)' } });
    }
    
    // Copy paste the rest of the doPost logic for routing
    try {
      var action = body.action;
      var def = ACTIONS_()[action];
      if (!def) fail_('UNKNOWN_ACTION', 'ไม่รู้จักคำสั่ง "' + action + '"');
      
      var ctx = buildContext_(body.idToken, def);
      if (def.roles && def.roles.indexOf(ctx.role) < 0) {
        fail_('FORBIDDEN', 'บัญชีของคุณไม่มีสิทธิ์ใช้งานส่วนนี้');
      }
      
      var data = def.fn(ctx, body.payload || {});
      return json_({ ok: true, data: data, serverTime: nowIso_(), ms: Date.now() - started });
      
    } catch (err) {
      var code = (err && err.code) || 'INTERNAL_ERROR';
      var message = (err && err.message) || 'เกิดข้อผิดพลาดภายในระบบ';
      return json_({ ok: false, error: { code: code, message: message } });
    }
  }

  // Default behavior
  return json_({
    ok: true,
    data: {
      service: 'NU494 Course Hub API',
      serverTime: nowIso_(),
      timezone: "Asia/Bangkok",
      version: '1.0.0'
    }
  });
}
