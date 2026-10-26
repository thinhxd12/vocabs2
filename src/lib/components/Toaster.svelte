<script lang="ts">
  import IconCheckCircle from "~icons/ph/check-circle";
  import IconInfo from "~icons/ph/info";
  import IconWarningCircle from "~icons/ph/warning-circle";
  import IconX from "~icons/ph/x";
  import { dismissToast, toasts, type ToastType } from "#lib/store/toast.svelte.ts";

  /** Icon and accent per toast kind. Colour is never the only signal — the
   *  icon and the heading text carry the meaning too. */
  const TONES = {
    error: { icon: IconWarningCircle, accent: "text-red-400" },
    success: { icon: IconCheckCircle, accent: "text-emerald-300" },
    info: { icon: IconInfo, accent: "text-sky-300" },
  } satisfies Record<ToastType, { icon: typeof IconInfo; accent: string }>;
</script>

<!-- Sits clear of the fixed NavBar so it never hides behind it. -->
<div
  class="pointer-events-none fixed inset-x-0 bottom-88 z-30 flex flex-col items-center gap-8 px-16"
  aria-live="polite"
>
  {#each toasts as toast (toast.id)}
    {@const tone = TONES[toast.type]}
    {@const Icon = tone.icon}
    <div
      role="status"
      class="pointer-events-auto flex w-full max-w-378 items-start gap-10 rounded-12 border border-white/10 bg-slate-900/90 px-12 py-10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-sm"
    >
      <Icon class="mt-px size-16 shrink-0 {tone.accent}" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="text-12 font-semibold text-white">{toast.title}</p>
        {#if toast.message}
          <p class="mt-2 text-11 leading-snug text-slate-300">
            {toast.message}
          </p>
        {/if}
      </div>
      <button
        type="button"
        onclick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
        class="-mt-2 -mr-4 inline-flex size-24 shrink-0 items-center justify-center rounded-6 text-slate-400 transition-colors outline-offset-2 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300"
      >
        <IconX class="size-14" aria-hidden="true" />
      </button>
    </div>
  {/each}
</div>
