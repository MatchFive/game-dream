/** 服务端返回的是自由字符串，这里只做已知状态到样式的映射。 */
export type GateStatus = string | undefined;

/** 闸门状态 → 圆点/文字配色。error 是环境问题，不能和 fail 共用红色。 */
export function gateStatusClass(status: GateStatus): 'ok' | 'bad' | 'error' | 'warn' {
  if (status === 'pass') return 'ok';
  if (status === 'fail') return 'bad';
  if (status === 'error') return 'error';
  return 'warn';
}

/** 闸门状态 → 界面文案键，交给调用方翻译。 */
export function gateStatusKey(status: GateStatus): string {
  if (status === 'pass') return 'common.pass';
  if (status === 'fail') return 'common.fail';
  if (status === 'skip') return 'common.skip';
  if (status === 'error') return 'studio.gateError';
  return 'studio.notRun';
}

/** 所有闸门都通过才算验证通过；skip（引擎缺失）和 error（引擎崩溃）都不算。 */
export function gatesPassed(gates: Record<string, { status?: string } | undefined>): boolean {
  const values = Object.values(gates);
  return values.length > 0 && values.every((gate) => gate?.status === 'pass');
}
