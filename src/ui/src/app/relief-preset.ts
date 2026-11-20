import { definePreset } from '@openng/optimus-ui-themes';
import Aura from '@openng/optimus-ui-themes/aura';

/**
 * One colour scheme for light and dark: the `--relief-*` tokens switch themselves (`:root.dark`),
 * so the preset only points at them. The accent text takes the page background, which is the
 * contrasting colour in both themes.
 */
const scheme = {
  surface: {
    0: 'var(--relief-panel)',
    50: 'var(--relief-panel-2)',
    100: 'var(--relief-panel-2)',
    200: 'var(--relief-line)',
    300: 'var(--relief-line-2)',
    400: 'var(--relief-faint)',
    500: 'var(--relief-faint)',
    600: 'var(--relief-muted)',
    700: 'var(--relief-muted)',
    800: 'var(--relief-fg)',
    900: 'var(--relief-fg)',
    950: 'var(--relief-fg)',
  },
  primary: {
    color: 'var(--relief-accent)',
    contrastColor: 'var(--relief-panel)',
    hoverColor: 'var(--relief-accent)',
    activeColor: 'var(--relief-accent)',
  },
  highlight: {
    background: 'var(--relief-panel-2)',
    focusBackground: 'var(--relief-panel-2)',
    color: 'var(--relief-fg)',
    focusColor: 'var(--relief-fg)',
  },
};

/** Aura, derived on the relief tokens (`--relief-*`, 6 px radius, inherited 13 px font). */
export const ReliefPreset = definePreset(Aura, {
  semantic: {
    transitionDuration: '0.12s',
    borderRadius: { none: '0', xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '10px' },
    focusRing: { width: '0', style: 'none', color: 'transparent', offset: '0' },
    colorScheme: { light: scheme, dark: scheme },
  },
  components: {
    select: {
      overlay: {
        background: 'var(--relief-panel)',
        borderColor: 'var(--relief-line-2)',
        borderRadius: '8px',
        color: 'var(--relief-fg)',
        shadow: 'var(--relief-shadow)',
      },
      option: {
        focusBackground: 'var(--relief-panel-2)',
        selectedBackground: 'var(--relief-panel-2)',
        selectedFocusBackground: 'var(--relief-panel-2)',
        color: 'var(--relief-fg)',
        focusColor: 'var(--relief-fg)',
        selectedColor: 'var(--relief-fg)',
        selectedFocusColor: 'var(--relief-fg)',
      },
    },
  },
});
