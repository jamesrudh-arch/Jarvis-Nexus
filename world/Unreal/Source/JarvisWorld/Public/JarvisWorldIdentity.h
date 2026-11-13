// JARVIS NEXUS - persistent entity identities (Master Directive Part 5;
// blueprint world-topology.md 4.2: PREFIX-NNN, e.g. REG-001, CTY-001).
#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "JarvisWorldIdentity.generated.h"

USTRUCT(BlueprintType)
struct FJarvisEntityId
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite) FString Prefix;  // e.g. "REG"
	UPROPERTY(BlueprintReadWrite) int32 Number = 0; // e.g. 1 -> "REG-001"

	bool IsValid() const
	{
		return Prefix.Len() >= 2 && Prefix.Len() <= 4 && Number >= 1 && Number <= 999999;
	}
};

UCLASS()
class UJarvisIdentityLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/** Format an id as PREFIX-NNN (zero-padded to 3, wider if needed). */
	UFUNCTION(BlueprintPure, Category = "Jarvis|Identity")
	static FString FormatEntityId(const FJarvisEntityId& Id);

	/** Parse "PREFIX-NNN"; returns false on any malformed input. */
	UFUNCTION(BlueprintCallable, Category = "Jarvis|Identity")
	static bool TryParseEntityId(const FString& Raw, FJarvisEntityId& OutId);

	/** Convenience constructor. */
	UFUNCTION(BlueprintPure, Category = "Jarvis|Identity")
	static FJarvisEntityId MakeEntityId(const FString& Prefix, int32 Number);

	/** Known blueprint prefixes (world-topology.md 4.2). Village and railway
	 *  prefixes remain owner-pending (F-M1/F-M2) — the library accepts any
	 *  well-formed 2-4 letter uppercase prefix meanwhile. */
	UFUNCTION(BlueprintPure, Category = "Jarvis|Identity")
	static TArray<FString> GetKnownPrefixes();
};
