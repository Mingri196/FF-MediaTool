/**
 * 全局弹窗注册栈：所有受控 Dialog / AlertDialog 在打开时注册关闭回调，
 * 全局 ESC 快捷键据此关闭最顶层弹窗（优先级高于 /about 返回）。
 */
type CloseFn = () => void;

let stack: CloseFn[] = [];

/** 弹窗打开时注册关闭回调，返回注销函数 */
export function registerDialogClose(fn: CloseFn): () => void {
  stack.push(fn);
  return () => {
    const i = stack.indexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** 是否有弹窗处于打开状态 */
export function hasOpenDialog(): boolean {
  return stack.length > 0;
}

/** 关闭最顶层弹窗（出栈并调用其关闭回调），返回是否有关闭动作 */
export function closeTopDialog(): boolean {
  const fn = stack[stack.length - 1];
  if (!fn) return false;
  stack.pop();
  fn();
  return true;
}

/** 测试用：清空注册栈 */
export function resetDialogStack() {
  stack = [];
}
