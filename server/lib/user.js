// 账户校验：与 App 端 services/UserService.ets 规则一致，服务端为最终裁决方。
function validateRegistration(existingNames, username, password, confirm) {
  const name = String(username || '').trim();
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(name)) { return '用户名需为 4–20 位字母、数字或下划线'; }
  if (existingNames.some(n => n.toLowerCase() === name.toLowerCase())) { return '用户名已存在'; }
  if (String(password || '').length < 8 || String(password || '').length > 32 ||
    !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) { return '密码需为 8–32 位，包含字母和数字'; }
  if (password !== confirm) { return '两次密码不一致'; }
  return '';
}
function validateNickname(nickname) {
  const value = String(nickname || '').trim();
  if (value.length < 1 || value.length > 20) { return '昵称需为 1–20 个字符'; }
  return '';
}
function validateAddress(address) {
  const name = String((address && address.name) || '').trim();
  const phone = String((address && address.phone) || '').trim();
  const region = String((address && address.region) || '').trim();
  const detail = String((address && address.detail) || '').trim();
  if (name.length < 1 || name.length > 20) { return '收货人需为 1–20 个字符'; }
  if (!/^1[3-9][0-9]{9}$/.test(phone)) { return '请输入有效的 11 位手机号码'; }
  if (region.length < 2 || region.length > 60) { return '请填写省、市、区，长度 2–60 个字符'; }
  if (detail.length < 5 || detail.length > 100) { return '详细地址需为 5–100 个字符'; }
  return '';
}

module.exports = { validateRegistration, validateNickname, validateAddress };
