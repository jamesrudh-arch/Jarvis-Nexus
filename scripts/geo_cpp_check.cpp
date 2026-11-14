// Standalone compile-and-cross-check harness for the JarvisGeo numerics.
//
// The TM series below is the EXACT algorithm block from
// world/Unreal/Source/JarvisWorld/Private/JarvisGeoLibrary.cpp (ForwardTM /
// InverseTM / FKruegerCoefficients / constants), extracted so it can compile
// with plain g++ in the sandbox (no Unreal Engine available — blocker B2).
// The only substitutions are the two trivial UE shims at the top.
//
// Usage:
//   g++ -O2 -std=c++17 scripts/geo_cpp_check.cpp -o /tmp/geo_cpp_check
//   /tmp/geo_cpp_check            # reads "lat lon" pairs on stdin, writes "E N"
//   echo "45.0 10.0" | /tmp/geo_cpp_check
//
// scripts/geo_verify_cpp.py drives this + the Python mirror and compares.

#include <cmath>
#include <cstdio>
#include <string>

// ---- UE shims (the only difference from the shipping source) -------------
namespace FMath
{
        inline double DegreesToRadians(double D) { return D * 3.14159265358979323846 / 180.0; }
        inline double RadiansToDegrees(double R) { return R * 180.0 / 3.14159265358979323846; }
        inline double Sqrt(double V) { return std::sqrt(V); }
}
struct FVector2D { double X, Y; FVector2D(double InX, double InY) : X(InX), Y(InY) {} };

// ==== VERBATIM from JarvisGeoLibrary.cpp (namespace JarvisGeo) ============
namespace JarvisGeo
{
        constexpr double SemiMajorAxisA = 6378137.0;
        constexpr double FlatteningF = 1.0 / 298.257223563;
        constexpr double AnchorLatDeg = 45.0;
        constexpr double AnchorLonDeg = 10.0;
        constexpr double ScaleFactorK0 = 1.0;
        constexpr double UnrealUnitsPerMetre = 100.0;
        constexpr double WorldExtentEastWestMetres = 400000.0;
        constexpr double WorldExtentNorthSouthMetres = 600000.0;

        struct FKruegerCoefficients
        {
                double Alpha[7];
                double Beta[7];
                double A;
                double E;
                double N;

                FKruegerCoefficients()
                {
                        const double a = SemiMajorAxisA;
                        const double f = FlatteningF;
                        const double n = f / (2.0 - f);
                        N = n;
                        E = FMath::Sqrt(2.0 * f - f * f);

                        const double n2 = n * n;
                        const double n3 = n2 * n;
                        const double n4 = n3 * n;
                        const double n5 = n4 * n;
                        const double n6 = n5 * n;

                        Alpha[1] =      (1.0/2.0)*n -   (2.0/3.0)*n2 +   (5.0/16.0)*n3 +  (41.0/180.0)*n4 -  (127.0/288.0)*n5 +  (7891.0/37800.0)*n6;
                        Alpha[2] =                  (13.0/48.0)*n2 -    (3.0/5.0)*n3 + (557.0/1440.0)*n4 +  (281.0/630.0)*n5 - (1983433.0/1935360.0)*n6;
                        Alpha[3] =                                    (61.0/240.0)*n3 - (103.0/140.0)*n4 + (15061.0/26880.0)*n5 +  (167603.0/181440.0)*n6;
                        Alpha[4] =                                                 (49561.0/161280.0)*n4 -     (179.0/168.0)*n5 + (6601661.0/7257600.0)*n6;
                        Alpha[5] =                                                                   (34729.0/80640.0)*n5 - (3418889.0/1995840.0)*n6;
                        Alpha[6] =                                                                                     (212378941.0/319334400.0)*n6;

                        Beta[1] = (1.0/2.0)*n -   (2.0/3.0)*n2 +  (37.0/96.0)*n3 -    (1.0/360.0)*n4 -    (81.0/512.0)*n5 + (96199.0/604800.0)*n6;
                        Beta[2] =                 (1.0/48.0)*n2 +  (1.0/15.0)*n3 - (437.0/1440.0)*n4 +    (46.0/105.0)*n5 - (1118711.0/3870720.0)*n6;
                        Beta[3] =                                 (17.0/480.0)*n3 - (37.0/840.0)*n4 -  (209.0/4480.0)*n5 +   (5569.0/90720.0)*n6;
                        Beta[4] =                                                 (4397.0/161280.0)*n4 -   (11.0/504.0)*n5 - (830251.0/7257600.0)*n6;
                        Beta[5] =                                                                    (4583.0/161280.0)*n5 - (108847.0/3991680.0)*n6;
                        Beta[6] =                                                                                      (20648693.0/638668800.0)*n6;

                        A = (a / (1.0 + n)) * (1.0 + n2 / 4.0 + n4 / 64.0 + n6 / 256.0);
                }
        };

        static const FKruegerCoefficients& Coeffs()
        {
                static FKruegerCoefficients Instance;
                return Instance;
        }

        // Forward declaration: FAnchorCache's constructor projects the anchor point.
        static void ForwardTM(double LatDeg, double LonDeg, double& OutEast, double& OutNorth);

        struct FAnchorCache
        {
                double East;
                double North;
                FAnchorCache()
                {
                        ForwardTM(AnchorLatDeg, AnchorLonDeg, East, North);
                }
        };

        static const FAnchorCache& Anchor()
        {
                static FAnchorCache Instance;
                return Instance;
        }

        static void ForwardTM(double LatDeg, double LonDeg, double& OutEast, double& OutNorth)
        {
                const FKruegerCoefficients& C = Coeffs();
                const double Phi = FMath::DegreesToRadians(LatDeg);
                const double Lam = FMath::DegreesToRadians(LonDeg - AnchorLonDeg);

                const double SinPhi = std::sin(Phi);
                const double Psi = std::atanh(SinPhi) - C.E * std::atanh(C.E * SinPhi);
                const double T = std::sinh(Psi);

                const double CosLam = std::cos(Lam);
                const double SinLam = std::sin(Lam);

                const double Xi1  = std::atan2(T, CosLam);
                const double B    = SinLam / FMath::Sqrt(1.0 + T * T);
                const double Eta1 = std::atanh(B);

                double Xi = Xi1;
                double Eta = Eta1;
                for (int J = 1; J <= 6; ++J)
                {
                        const double TwoJXi = 2.0 * J * Xi1;
                        const double TwoJEta = 2.0 * J * Eta1;
                        Xi  += C.Alpha[J] * std::sin(TwoJXi) * std::cosh(TwoJEta);
                        Eta += C.Alpha[J] * std::cos(TwoJXi) * std::sinh(TwoJEta);
                }

                OutEast  = ScaleFactorK0 * C.A * Eta;
                OutNorth = ScaleFactorK0 * C.A * Xi;
        }

        static void InverseTM(double East, double North, double& OutLatDeg, double& OutLonDeg)
        {
                const FKruegerCoefficients& C = Coeffs();
                const double Xi  = North / (ScaleFactorK0 * C.A);
                const double Eta = East  / (ScaleFactorK0 * C.A);

                double Xi1 = Xi;
                double Eta1 = Eta;
                for (int J = 1; J <= 6; ++J)
                {
                        const double TwoJXi = 2.0 * J * Xi;
                        const double TwoJEta = 2.0 * J * Eta;
                        Xi1  -= C.Beta[J] * std::sin(TwoJXi) * std::cosh(TwoJEta);
                        Eta1 -= C.Beta[J] * std::cos(TwoJXi) * std::sinh(TwoJEta);
                }

                const double SinXi1 = std::sin(Xi1);
                const double Chi = std::asin(SinXi1 / std::cosh(Eta1));
                const double Lam = std::atan2(std::sinh(Eta1), std::cos(Xi1));

                const double PsiTarget = std::atanh(std::sin(Chi));
                const double E2 = C.E * C.E;
                double Phi = Chi;
                for (int Iter = 0; Iter < 5; ++Iter)
                {
                        const double SinPhi = std::sin(Phi);
                        const double CosPhi = std::cos(Phi);
                        const double Psi = std::atanh(SinPhi) - C.E * std::atanh(C.E * SinPhi);
                        const double DPsi = (1.0 - E2) / (CosPhi * (1.0 - E2 * SinPhi * SinPhi));
                        Phi += (PsiTarget - Psi) / DPsi;
                }

                OutLatDeg = FMath::RadiansToDegrees(Phi);
                OutLonDeg = FMath::RadiansToDegrees(Lam) + AnchorLonDeg;
        }
}
// ==== end verbatim block ====================================================

// Public API mirrors (same maths as UJarvisGeoLibrary, minus UE reflection).
static FVector2D LatLonToLocalMetres(double LatDeg, double LonDeg)
{
        double East = 0.0, North = 0.0;
        JarvisGeo::ForwardTM(LatDeg, LonDeg, East, North);
        const JarvisGeo::FAnchorCache& Anc = JarvisGeo::Anchor();
        return FVector2D(East - Anc.East, North - Anc.North);
}

static void LocalMetresToLatLon(double EastMetres, double NorthMetres, double& OutLat, double& OutLon)
{
        const JarvisGeo::FAnchorCache& Anc = JarvisGeo::Anchor();
        JarvisGeo::InverseTM(EastMetres + Anc.East, NorthMetres + Anc.North, OutLat, OutLon);
}

int main(int argc, char** argv)
{
        // Mode 1: no args — read "lat lon" lines from stdin, print "east north".
        // Mode 2: argv[1] == "inverse" — read "east north", print "lat lon".
        bool Inverse = false;
        if (argc > 1 && std::string(argv[1]) == "inverse") { Inverse = true; }

        double A = 0.0, B = 0.0;
        while (std::scanf("%lf %lf", &A, &B) == 2)
        {
                if (Inverse)
                {
                        double Lat, Lon;
                        LocalMetresToLatLon(A, B, Lat, Lon);
                        std::printf("%.12f %.12f\n", Lat, Lon);
                }
                else
                {
                        const FVector2D EN = LatLonToLocalMetres(A, B);
                        std::printf("%.6f %.6f\n", EN.X, EN.Y);
                }
        }
        return 0;
}
