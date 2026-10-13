/** Soft curved page background — stronger at the bottom, washed out at the top. */
export function SoftPageBg() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        backgroundImage: "url(/hub-bg.png)",
        backgroundSize: "cover",
        backgroundPosition: "center bottom",
        backgroundRepeat: "no-repeat",
        opacity: 0.55,
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.4) 65%, rgba(0,0,0,0.75) 100%)",
        maskImage:
          "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.4) 65%, rgba(0,0,0,0.75) 100%)",
      }}
    />
  );
}
