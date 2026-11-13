// JARVIS NEXUS - authoritative coordinate conversion (Master Directive Part 5;
// blueprint world-topology.md 4.2). Blueprint-callable surface.
//
// EPSG:4326 <-> Transverse Mercator local metres (anchor 45N/10E, k0=1,
// WGS84, Krueger 6th-order series) <-> Unreal doubles (1 m = 100 UU;
// X = east, Y = south, Z = up).
#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "JarvisGeoLibrary.generated.h"

USTRUCT(BlueprintType)
struct FJarvisGeoResult
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) double East = 0.0;   // local metres, +east
	UPROPERTY(BlueprintReadOnly) double North = 0.0;  // local metres, +north
	UPROPERTY(BlueprintReadOnly) double Up = 0.0;     // metres above the local datum
};

UCLASS()
class UJarvisGeoLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/** EPSG:4326 degrees -> local metric TM (metres, anchor-relative). */
	UFUNCTION(BlueprintCallable, Category = "Jarvis|Geo")
	static FJarvisGeoResult LatLonToLocalMetres(double LatDeg, double LonDeg, double UpMetres = 0.0);

	/** Local metric TM (metres) -> EPSG:4326 degrees. */
	UFUNCTION(BlueprintCallable, Category = "Jarvis|Geo")
	static void LocalMetresToLatLon(double East, double North, double Up, double& OutLatDeg, double& OutLonDeg);

	/** Local metres -> Unreal units (X=east, Y=south, Z=up; 1 m = 100 UU). */
	UFUNCTION(BlueprintCallable, Category = "Jarvis|Geo")
	static FVector LocalMetresToUnreal(double East, double North, double Up);

	/** Unreal units -> local metres. */
	UFUNCTION(BlueprintCallable, Category = "Jarvis|Geo")
	static void UnrealToLocalMetres(const FVector& UnrealXYZ, double& OutEast, double& OutNorth, double& OutUp);

	/** True inside the blueprint world extent: 400 km E-W x 600 km N-S. */
	UFUNCTION(BlueprintPure, Category = "Jarvis|Geo")
	static bool IsInsideWorldExtent(double East, double North);

	/** The six blueprint region centres (world-topology.md 4.3), local metres. */
	UFUNCTION(BlueprintPure, Category = "Jarvis|Geo")
	static TArray<FVector2D> GetRegionCentres();
};
