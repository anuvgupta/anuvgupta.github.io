/** Stacking order shared by every window on the desktop: the page windows and the wallpaper loader. */
let top = 10;

export const nextZ = () => ++top;

/** Whether this window is the frontmost one. */
export const isFront = (el: HTMLElement) => +el.style.zIndex === top;
