/**
 * Câmera e dimensionamento do canvas.
 *
 * Duas coordenadas convivem aqui. O "mundo" é onde a física acontece e não
 * depende do tamanho da janela; a "tela" é o pixel. Toda conversão passa por
 * estas funções, então nenhuma outra parte do código precisa saber de
 * devicePixelRatio ou de zoom.
 */

export const ZOOM_MIN = 0.18;
export const ZOOM_MAX = 3.4;

export function createViewport(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const cam = { x: 0, y: 0, k: 1 };
  const vp = { canvas, ctx, cam, W: 0, H: 0, DPR: 1 };

  vp.resize = function resize() {
    vp.DPR = Math.min(window.devicePixelRatio || 1, 2);
    vp.W = canvas.clientWidth;
    vp.H = canvas.clientHeight;
    canvas.width = Math.round(vp.W * vp.DPR);
    canvas.height = Math.round(vp.H * vp.DPR);
    ctx.setTransform(vp.DPR, 0, 0, vp.DPR, 0, 0);
  };

  /**
   * Zoom que faz o grafo caber.
   *
   * Só o enquadramento de largada: no instante zero todos os nós estão sobre
   * o centro, então não há raio para medir. Depois que a expansão assenta,
   * main.js mede o raio real e chama kParaRaio — é esse o enquadramento que
   * acompanha domínios novos e físicas diferentes.
   */
  vp.fit = function fit() {
    const f = Math.min(vp.W, vp.H) / 1450;
    cam.k = Math.max(0.18, Math.min(0.8, f));
    cam.x = 0;
    cam.y = 0;
  };

  /**
   * Zoom que faz caber um grafo de raio `r` (unidades do mundo), com folga
   * para os rótulos. O fit() acima é só o enquadramento de largada; depois
   * que a expansão assenta, main.js mede o raio real e chama isto. Assim um
   * domínio novo, ou parâmetros de física diferentes, nunca vazam da tela.
   */
  vp.kParaRaio = function kParaRaio(r) {
    const meia = Math.min(vp.W, vp.H) / 2;
    return Math.max(ZOOM_MIN, Math.min(1.1, (meia * 0.9) / (r + 60)));
  };

  vp.toScreenX = (wx) => (wx - cam.x) * cam.k + vp.W / 2;
  vp.toScreenY = (wy) => (wy - cam.y) * cam.k + vp.H / 2;
  vp.toWorld = (sx, sy) => ({
    x: (sx - vp.W / 2) / cam.k + cam.x,
    y: (sy - vp.H / 2) / cam.k + cam.y
  });

  /** Zoom mantendo fixo o ponto do mundo que está sob o cursor. */
  vp.zoomAt = function zoomAt(sx, sy, factor) {
    const w = vp.toWorld(sx, sy);
    cam.k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.k * factor));
    cam.x = w.x - (sx - vp.W / 2) / cam.k;
    cam.y = w.y - (sy - vp.H / 2) / cam.k;
  };

  /**
   * Onde a câmera precisa estar para que o ponto (wx, wy) do mundo caia no
   * centro da área LIVRE — ou seja, descontando o espaço que o painel ocupa.
   * Sem isso o nó selecionado ficaria atrás do painel.
   */
  vp.centerFor = function centerFor(wx, wy, inset = { right: 0, bottom: 0 }) {
    return {
      x: wx + (inset.right || 0) / (2 * cam.k),
      y: wy + (inset.bottom || 0) / (2 * cam.k)
    };
  };

  return vp;
}
