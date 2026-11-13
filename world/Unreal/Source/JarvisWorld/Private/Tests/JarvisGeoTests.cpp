// JARVIS NEXUS - sandbox-verifiable automation tests for the JarvisWorld module.
// Four tests: Jarvis.Geo.* x3 + Jarvis.Identity.* x1 (Phase 3 report §7).
//
// Assertion style: explicit TestTrue comparisons (no reliance on optional
// floating-point TestEqual overloads) so this compiles on any UE 5.5 host.
#include "Misc/AutomationTest.h"
#include "JarvisGeoLibrary.h"
#include "JarvisWorldIdentity.h"

namespace
{
	const double ToleranceMetres = 0.01; // blueprint 4.2: round-trip within 1 cm
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FJarvisGeoRoundTripTest,
	"Jarvis.Geo.RoundTripUnder1cm",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::SmokeFilter)
{
	bool Ok = true;
	// Blueprint region centres + extent corners.
	TArray<FVector2D> All = UJarvisGeoLibrary::GetRegionCentres();
	All.Add(FVector2D(-200000.0, 300000.0));
	All.Add(FVector2D(200000.0, 300000.0));
	All.Add(FVector2D(-200000.0, -300000.0));
	All.Add(FVector2D(200000.0, -300000.0));

	double MaxErr = 0.0;
	for (const FVector2D& P : All)
	{
		double Lat = 0.0, Lon = 0.0;
		UJarvisGeoLibrary::LocalMetresToLatLon(P.X, P.Y, 0.0, Lat, Lon);
		const FJarvisGeoResult R = UJarvisGeoLibrary::LatLonToLocalMetres(Lat, Lon);
		const double Err = FMath::Sqrt(FMath::Square(R.East - P.X) + FMath::Square(R.North - P.Y));
		MaxErr = FMath::Max(MaxErr, Err);
		if (Err > ToleranceMetres)
		{
			AddError(FString::Printf(
				TEXT("Round-trip error %e m at local (%.1f, %.1f) exceeds 1 cm."),
				Err, P.X, P.Y));
			Ok = false;
		}
	}
	TestTrue(TEXT("Round-trip max error under 1 cm"), Ok);
	AddInformation(FString::Printf(TEXT("Max round-trip error: %e m over %d points."),
		MaxErr, All.Num()));
	return Ok;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FJarvisGeoConventionsTest,
	"Jarvis.Geo.AxisConventionsAndAnchor",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::SmokeFilter)
{
	bool Ok = true;

	// The local origin must be the fictional anchor 45N / 10E.
	double Lat = 0.0, Lon = 0.0;
	UJarvisGeoLibrary::LocalMetresToLatLon(0.0, 0.0, 0.0, Lat, Lon);
	Ok &= TestTrue(TEXT("Origin latitude is the anchor 45N (1e-9)"), FMath::Abs(Lat - 45.0) < 1e-9);
	Ok &= TestTrue(TEXT("Origin longitude is the anchor 10E (1e-9)"), FMath::Abs(Lon - 10.0) < 1e-9);

	const FJarvisGeoResult At = UJarvisGeoLibrary::LatLonToLocalMetres(45.0, 10.0);
	Ok &= TestTrue(TEXT("Anchor east 0 m (1e-6)"), FMath::Abs(At.East) < 1e-6);
	Ok &= TestTrue(TEXT("Anchor north 0 m (1e-6)"), FMath::Abs(At.North) < 1e-6);

	// Axis conventions: X = east, Y = SOUTH, Z = up; 1 m = 100 UU.
	const FVector U = UJarvisGeoLibrary::LocalMetresToUnreal(1000.0, 500.0, 20.0);
	Ok &= TestTrue(TEXT("Unreal X = east * 100"), FMath::Abs(U.X - 100000.0) < 1e-6);
	Ok &= TestTrue(TEXT("Unreal Y = south * 100 (north 500 m -> -50000)"), FMath::Abs(U.Y - (-50000.0)) < 1e-6);
	Ok &= TestTrue(TEXT("Unreal Z = up * 100"), FMath::Abs(U.Z - 2000.0) < 1e-6);

	double E = 0.0, N = 0.0, Up = 0.0;
	UJarvisGeoLibrary::UnrealToLocalMetres(U, E, N, Up);
	Ok &= TestTrue(TEXT("Unreal -> local east"), FMath::Abs(E - 1000.0) < 1e-6);
	Ok &= TestTrue(TEXT("Unreal -> local north"), FMath::Abs(N - 500.0) < 1e-6);
	Ok &= TestTrue(TEXT("Unreal -> local up"), FMath::Abs(Up - 20.0) < 1e-6);

	// All six region centres inside the extent.
	const TArray<FVector2D> Centres = UJarvisGeoLibrary::GetRegionCentres();
	int32 Inside = 0;
	for (const FVector2D& C : Centres)
	{
		if (UJarvisGeoLibrary::IsInsideWorldExtent(C.X, C.Y)) { ++Inside; }
	}
	Ok &= TestEqual(TEXT("All six region centres inside extent"), Inside, 6);
	return Ok;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FJarvisGeoExtentTest,
	"Jarvis.Geo.WorldExtentBounds",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::SmokeFilter)
{
	bool Ok = true;
	Ok &= TestTrue(TEXT("Inside at (0,0)"), UJarvisGeoLibrary::IsInsideWorldExtent(0.0, 0.0));
	Ok &= TestTrue(TEXT("Inside at extent corner (200k,300k)"),
		UJarvisGeoLibrary::IsInsideWorldExtent(200000.0, 300000.0));
	Ok &= TestFalse(TEXT("Outside east 200001"),
		UJarvisGeoLibrary::IsInsideWorldExtent(200001.0, 0.0));
	Ok &= TestFalse(TEXT("Outside north -300001"),
		UJarvisGeoLibrary::IsInsideWorldExtent(0.0, -300001.0));
	Ok &= TestFalse(TEXT("Outside far corner"),
		UJarvisGeoLibrary::IsInsideWorldExtent(999999.0, 999999.0));
	return Ok;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FJarvisIdentityTest,
	"Jarvis.Identity.ParseFormatRoundTrip",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::SmokeFilter)
{
	bool Ok = true;

	const FJarvisEntityId Made = UJarvisIdentityLibrary::MakeEntityId(TEXT("REG"), 1);
	Ok &= TestEqual(TEXT("Format REG-001"),
		UJarvisIdentityLibrary::FormatEntityId(Made), FString(TEXT("REG-001")));

	FJarvisEntityId Parsed;
	Ok &= TestTrue(TEXT("Parse REG-001"), UJarvisIdentityLibrary::TryParseEntityId(TEXT("REG-001"), Parsed));
	Ok &= TestEqual(TEXT("Parsed prefix"), Parsed.Prefix, FString(TEXT("REG")));
	Ok &= TestEqual(TEXT("Parsed number"), Parsed.Number, 1);

	FJarvisEntityId Parsed2;
	Ok &= TestTrue(TEXT("Parse CTY-007"), UJarvisIdentityLibrary::TryParseEntityId(TEXT("CTY-007"), Parsed2));
	Ok &= TestEqual(TEXT("Format CTY-007"),
		UJarvisIdentityLibrary::FormatEntityId(Parsed2), FString(TEXT("CTY-007")));

	FJarvisEntityId Bad;
	Ok &= TestFalse(TEXT("Reject lowercase"), UJarvisIdentityLibrary::TryParseEntityId(TEXT("reg-001"), Bad));
	Ok &= TestFalse(TEXT("Reject no number"), UJarvisIdentityLibrary::TryParseEntityId(TEXT("REG-"), Bad));
	Ok &= TestFalse(TEXT("Reject empty"), UJarvisIdentityLibrary::TryParseEntityId(TEXT(""), Bad));
	Ok &= TestFalse(TEXT("Reject no dash"), UJarvisIdentityLibrary::TryParseEntityId(TEXT("REG001"), Bad));
	Ok &= TestFalse(TEXT("Reject zero"), UJarvisIdentityLibrary::TryParseEntityId(TEXT("REG-000"), Bad));
	Ok &= TestFalse(TEXT("Reject 1-letter prefix"), UJarvisIdentityLibrary::TryParseEntityId(TEXT("R-001"), Bad));
	return Ok;
}
