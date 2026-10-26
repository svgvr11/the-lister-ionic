/**
 * Cálculo puro del destino de scroll para dejar una tarjeta completamente visible.
 * Sin DOM ni Angular DI: recibe rectángulos y devuelve el `scrollTop` destino (en
 * coordenadas del contenido scrolleable) o `null` si la tarjeta ya está a la vista
 * con el margen pedido.
 *
 * Reglas:
 * - Tarjeta completamente dentro del área visible, con margen a ambos lados: `null`,
 *   no se desplaza nada.
 * - Tarjeta más alta que el viewport: basta con que su parte superior sea visible, así
 *   que se alinea el borde superior con el margen superior.
 * - Tarjeta por debajo del área visible (total o parcialmente cortada abajo): se
 *   desplaza hacia abajo hasta que la tarjeta quepa entera con margen inferior.
 * - Tarjeta por encima del área visible: se desplaza hacia arriba hasta que el borde
 *   superior quede con el margen superior.
 *
 * El margen también protege la parte superior de la tarjeta del encabezado fijo, ya que
 * el área visible se mide sobre el contenedor de scroll (que empieza debajo del header).
 *
 * @param cardOffsetTop Tope de la tarjeta en coordenadas del contenido scrolleable.
 * @param cardHeight Altura de la tarjeta.
 * @param containerHeight Altura del área visible (alto del contenedor de scroll).
 * @param currentScrollTop `scrollTop` actual del contenedor.
 * @param margin Margen en px entre la tarjeta y cada borde del área visible.
 */
export function scrollDestinationForCard(
  cardOffsetTop: number,
  cardHeight: number,
  containerHeight: number,
  currentScrollTop: number,
  margin: number
): number | null {
  const cardBottom = cardOffsetTop + cardHeight;
  const viewBottom = currentScrollTop + containerHeight;

  const topLimit = currentScrollTop + margin;
  const bottomLimit = viewBottom - margin;

  // Completamente visible con margen a ambos lados: no hay que desplazar nada.
  if (cardOffsetTop >= topLimit && cardBottom <= bottomLimit) return null;

  // Más alta que el viewport: se alinea el borde superior.
  if (cardHeight > containerHeight) return cardOffsetTop - margin;

  // Por debajo del área visible: se lleva el borde inferior al límite inferior.
  if (cardBottom > bottomLimit) return cardBottom - containerHeight + margin;

  // Por encima del área visible: se lleva el borde superior al límite superior.
  if (cardOffsetTop < topLimit) return cardOffsetTop - margin;

  return null;
}
