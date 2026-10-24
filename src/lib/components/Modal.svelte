<script lang="ts">
  import { type Snippet } from 'svelte';

  interface Props {
    /** Two-way: closing the dialog (Escape, backdrop) writes `false` back. */
    showModal?: boolean;
    /** Accessible name for the dialog, since the header is page-authored. */
    label?: string;
    /**
     * `center` floats the dialog in the viewport; `fill` anchors it above the
     * app's fixed bottom navbar so the panel can use the full content height.
     */
    variant?: 'center' | 'fill';
    children?: Snippet;
    onclose?: () => void;
  }

  let {
    showModal = $bindable(false),
    label = 'Dialog',
    variant = 'center',
    children,
    onclose,
  }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialog) return;

    if (showModal && !dialog.open) dialog.showModal();
    else if (!showModal && dialog.open) dialog.close();
  });

  function handleClose() {
    showModal = false;
    onclose?.();
  }

  /** Outside clicks land on the dialog element itself, never on its content. */
  function handleClick(event: MouseEvent) {
    if (event.target === dialog) dialog?.close();
  }
</script>

<dialog
  bind:this={dialog}
  aria-label={label}
  class:fill={variant === 'fill'}
  onclose={handleClose}
  onclick={handleClick}
>
  {@render children?.()}
</dialog>

<style lang="postcss">
  dialog {
    border: none;
    padding: 0;
    margin: auto;
    background: transparent;
    max-width: unset;
    max-height: unset;
    overflow: visible;
  }

  dialog::backdrop {
    background-color: rgb(2 6 23 / 0.72);
    backdrop-filter: blur(6px);
  }

  /* Sit above the fixed navbar instead of centering in the full viewport. */
  dialog.fill {
    inset-block-start: 0;
    inset-block-end: auto;
    margin: 0 auto;
  }

  dialog[open] {
    animation: zoom 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  dialog[open]::backdrop {
    animation: fade 0.2s ease-out;
  }

  @keyframes zoom {
    from {
      transform: scale(0.96);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    dialog[open],
    dialog[open]::backdrop {
      animation: none;
    }
  }
</style>
