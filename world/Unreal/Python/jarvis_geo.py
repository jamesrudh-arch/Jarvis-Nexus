#!/usr/bin/env python3
"""JARVIS NEXUS - pure-stdlib mirror of the C++ geo conversion.

Same formulas as world/Unreal/Source/JarvisWorld/Private/JarvisGeoLibrary.cpp
(Krueger 6th-order Transverse Mercator; WGS84; anchor 45N/10E; k0=1).
Runs anywhere Python runs: the sandbox, the UE editor (Phase 5 atlas), and
the CI checks in scripts/geo_verify.py.

Blueprint world-topology.md 4.2:
  CRS EPSG:4326 -> local TM metres -> Unreal units (1 m = 100 UU;
  X = east, Y = south, Z = up). Round-trip tolerance 1 cm.
"""
import math

SEMI_MAJOR_AXIS_A = 6378137.0
FLATTENING_F = 1.0 / 298.257223563
ANCHOR_LAT_DEG = 45.0
ANCHOR_LON_DEG = 10.0
SCALE_FACTOR_K0 = 1.0
UNREAL_UNITS_PER_METRE = 100.0
WORLD_EXTENT_EW = 400000.0   # metres
WORLD_EXTENT_NS = 600000.0   # metres


def _coefficients():
    a = SEMI_MAJOR_AXIS_A
    f = FLATTENING_F
    n = f / (2.0 - f)
    e = math.sqrt(2.0 * f - f * f)

    n2 = n * n
    n3 = n2 * n
    n4 = n3 * n
    n5 = n4 * n
    n6 = n5 * n

    alpha = [0.0] * 7
    alpha[1] = (1/2)*n - (2/3)*n2 + (5/16)*n3 + (41/180)*n4 - (127/288)*n5 + (7891/37800)*n6
    alpha[2] = (13/48)*n2 - (3/5)*n3 + (557/1440)*n4 + (281/630)*n5 - (1983433/1935360)*n6
    alpha[3] = (61/240)*n3 - (103/140)*n4 + (15061/26880)*n5 + (167603/181440)*n6
    alpha[4] = (49561/161280)*n4 - (179/168)*n5 + (6601661/7257600)*n6
    alpha[5] = (34729/80640)*n5 - (3418889/1995840)*n6
    alpha[6] = 212378941 / 319334400 * n6

    beta = [0.0] * 7
    beta[1] = (1/2)*n - (2/3)*n2 + (37/96)*n3 - (1/360)*n4 - (81/512)*n5 + (96199/604800)*n6
    beta[2] = (1/48)*n2 + (1/15)*n3 - (437/1440)*n4 + (46/105)*n5 - (1118711/3870720)*n6
    beta[3] = (17/480)*n3 - (37/840)*n4 - (209/4480)*n5 + (5569/90720)*n6
    beta[4] = (4397/161280)*n4 - (11/504)*n5 - (830251/7257600)*n6
    beta[5] = (4583/161280)*n5 - (108847/3991680)*n6
    beta[6] = 20648693 / 638668800 * n6

    A = (a / (1.0 + n)) * (1.0 + n2/4.0 + n4/64.0 + n6/256.0)
    return alpha, beta, A, e


_ALPHA, _BETA, _A, _E = _coefficients()


def _forward_tm(lat_deg, lon_deg):
    phi = math.radians(lat_deg)
    lam = math.radians(lon_deg - ANCHOR_LON_DEG)

    sin_phi = math.sin(phi)
    psi = math.atanh(sin_phi) - _E * math.atanh(_E * sin_phi)
    t = math.sinh(psi)

    cos_lam = math.cos(lam)
    sin_lam = math.sin(lam)

    xi1 = math.atan2(t, cos_lam)
    b = sin_lam / math.sqrt(1.0 + t * t)
    eta1 = math.atanh(b)

    xi = xi1
    eta = eta1
    for j in range(1, 7):
        two_j_xi = 2.0 * j * xi1
        two_j_eta = 2.0 * j * eta1
        xi += _ALPHA[j] * math.sin(two_j_xi) * math.cosh(two_j_eta)
        eta += _ALPHA[j] * math.cos(two_j_xi) * math.sinh(two_j_eta)

    return SCALE_FACTOR_K0 * _A * eta, SCALE_FACTOR_K0 * _A * xi


def _inverse_tm(east, north):
    xi = north / (SCALE_FACTOR_K0 * _A)
    eta = east / (SCALE_FACTOR_K0 * _A)

    xi1 = xi
    eta1 = eta
    for j in range(1, 7):
        two_j_xi = 2.0 * j * xi
        two_j_eta = 2.0 * j * eta
        xi1 -= _BETA[j] * math.sin(two_j_xi) * math.cosh(two_j_eta)
        eta1 -= _BETA[j] * math.cos(two_j_xi) * math.sinh(two_j_eta)

    sin_xi1 = math.sin(xi1)
    chi = math.asin(sin_xi1 / math.cosh(eta1))
    lam = math.atan2(math.sinh(eta1), math.cos(xi1))

    psi_target = math.atanh(math.sin(chi))
    e2 = _E * _E
    phi = chi
    for _ in range(5):
        sin_phi = math.sin(phi)
        cos_phi = math.cos(phi)
        psi = math.atanh(sin_phi) - _E * math.atanh(_E * sin_phi)
        dpsi = (1.0 - e2) / (cos_phi * (1.0 - e2 * sin_phi * sin_phi))
        phi += (psi_target - psi) / dpsi

    return math.degrees(phi), math.degrees(lam) + ANCHOR_LON_DEG


_ANCHOR_E, _ANCHOR_N = _forward_tm(ANCHOR_LAT_DEG, ANCHOR_LON_DEG)


def lat_lon_to_local_metres(lat_deg, lon_deg):
    """EPSG:4326 degrees -> anchor-relative local metres (east, north)."""
    east, north = _forward_tm(lat_deg, lon_deg)
    return east - _ANCHOR_E, north - _ANCHOR_N


def local_metres_to_lat_lon(east, north):
    """Local metres -> EPSG:4326 degrees (lat, lon)."""
    return _inverse_tm(east + _ANCHOR_E, north + _ANCHOR_N)


def local_metres_to_unreal(east, north, up=0.0):
    """Local metres -> Unreal units. X = east, Y = SOUTH, Z = up; 1 m = 100 UU."""
    k = UNREAL_UNITS_PER_METRE
    return east * k, -north * k, up * k


def unreal_to_local_metres(x, y, z):
    """Unreal units -> local metres (east, north, up)."""
    k = UNREAL_UNITS_PER_METRE
    return x / k, -y / k, z / k


def is_inside_world_extent(east, north):
    """True inside the blueprint extent (400 x 600 km centred on the anchor)."""
    return abs(east) <= WORLD_EXTENT_EW * 0.5 and abs(north) <= WORLD_EXTENT_NS * 0.5


def region_centres():
    """The six blueprint region centres (world-topology.md 4.3) as (east, north)."""
    return [
        ("REG-001 Northern Highlands", 0.0, 220000.0),
        ("REG-002 Western Industrial", -120000.0, 0.0),
        ("REG-003 Central Metropolitan", 0.0, 0.0),
        ("REG-004 Eastern Technology", 120000.0, 0.0),
        ("REG-005 Southern Agricultural", 0.0, -150000.0),
        ("REG-006 Coastal Maritime", 0.0, -280000.0),
    ]


if __name__ == "__main__":
    # Smoke self-check: anchor round trip + region centres inside extent.
    lat, lon = local_metres_to_lat_lon(0.0, 0.0)
    assert abs(lat - 45.0) < 1e-9 and abs(lon - 10.0) < 1e-9, (lat, lon)
    e, n = lat_lon_to_local_metres(45.0, 10.0)
    assert abs(e) < 1e-6 and abs(n) < 1e-6, (e, n)
    for name, ee, nn in region_centres():
        assert is_inside_world_extent(ee, nn), name
    print("jarvis_geo self-check OK (anchor + 6 region centres)")
