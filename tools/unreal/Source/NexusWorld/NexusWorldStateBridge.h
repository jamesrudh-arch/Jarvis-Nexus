// Copyright (c) 2026 JARVIS NEXUS. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "HttpModule.h"
#include "NexusWorldStateBridge.generated.h"

/**
 * NEXUS World State Bridge.
 *
 * Authoritative world state (residents, properties, vehicles, economy,
 * causal events) lives in the NEXUS API — never only in the Unreal client
 * (directive SS7.1). This subsystem synchronises the client with the
 * authoritative store over the versioned HTTP contracts and raises
 * delegates when world events arrive, so gameplay systems can react
 * (spawning, audio, UI) without owning the truth.
 */
UCLASS()
class NEXUSWORLD_API UNexusWorldStateBridge : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Base URL of the NEXUS API (e.g. https://jarvis-nexus-production.up.railway.app). */
	UPROPERTY(Config, EditAnywhere, Category = "Nexus")
	FString ApiBaseUrl;

	/** Owner key for consequential operations. Never logged. */
	UPROPERTY(Config, Category = "Nexus")
	FString OwnerKey;

	/** Contract version this client speaks; mismatch = refuse to operate. */
	UPROPERTY(VisibleAnywhere, Category = "Nexus")
	FString ContractVersion;

	/** Fetch authoritative world state (GET /world/state). */
	void FetchWorldState(TFunction<void(bool bOk, const FString& Payload)> OnDone);

	/** Fetch a resident's state + knowledge (GET /world/residents/{id}). */
	void FetchResident(const FString& ResidentId, TFunction<void(bool bOk, const FString& Payload)> OnDone);

	/** Request a world construction (POST /world/construct) — owner authorised. */
	void RequestConstruction(const FString& Description, TFunction<void(bool bOk, const FString& Payload)> OnDone);

	/** Latest known world payload, cached from the last successful fetch. */
	const FString& GetCachedWorldJson() const { return CachedWorldJson; }

private:
	void PerformRequest(const FString& Verb, const FString& Path, const FString& Body, bool bOwnerAuth, TFunction<void(bool, const FString&)> OnDone);

	FString CachedWorldJson;
};
