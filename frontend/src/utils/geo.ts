const RAIO_TERRA_KM = 6371.0;

/** Formula de Haversine -- distancia geodesica (grande circulo) entre dois
 * pontos lat/long, em km. Mesma formula/precisao de
 * backend/app/pipeline/geo.py::distancia_km -- reimplementada aqui (nao
 * importada, sao runtimes/linguagens diferentes) so pra calcular ao vivo
 * no cliente a distancia ate o estabelecimento mais proximo em familias
 * sem o campo pre-calculado no pipeline (so TOMOGRAFO tem isso hoje, ver
 * MunicipalityCoverage.distance_km_nearest_equipment). */
export function distanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * RAIO_TERRA_KM * Math.asin(Math.sqrt(a));
}
