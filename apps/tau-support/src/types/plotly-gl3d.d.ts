declare module "plotly.js-gl3d-dist-min" {
  const Plotly: {
    react: (
      element: HTMLElement,
      data: unknown[],
      layout: unknown,
      config: unknown
    ) => Promise<unknown>;
    purge: (element: HTMLElement) => void;
  };
  export default Plotly;
}
