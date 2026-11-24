/** Stacking order shared by every window on the desktop: the page windows and the wallpaper loader. */
/** Below every window that has been brought forward. */
export const BOTTOM_Z = 10;

let top = BOTTOM_Z;

export const nextZ = () => ++top;

/** Whether this window is the frontmost one. */
export const isFront = (el: HTMLElement) => +el.style.zIndex === top;
