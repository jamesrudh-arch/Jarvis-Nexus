// Copyright (c) 2026 JARVIS NEXUS. All Rights Reserved.

#include "NexusWorldStateBridge.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Interfaces/IHttpRequest.h"
#include "Misc/ConfigCacheIni.h"

void UNexusWorldStateBridge::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	ContractVersion = TEXT("1.0.0");

	// Default: public production endpoint; overridable in DefaultGame.ini
	ApiBaseUrl = TEXT("https://jarvis-nexus-production.up.railway.app");
	if (GConfig)
	{
		GConfig->GetString(TEXT("Nexus.World"), TEXT("ApiBaseUrl"), ApiBaseUrl, GGameIni);
	}
}

void UNexusWorldStateBridge::Deinitialize()
{
	Super::Deinitialize();
}

void UNexusWorldStateBridge::FetchWorldState(TFunction<void(bool, const FString&)> OnDone)
{
	PerformRequest(TEXT("GET"), TEXT("/world/state"), FString(), false,
		[this, OnDone](bool bOk, const FString& Payload)
		{
			if (bOk)
			{
				CachedWorldJson = Payload;
			}
			OnDone(bOk, Payload);
		});
}

void UNexusWorldStateBridge::FetchResident(const FString& ResidentId, TFunction<void(bool, const FString&)> OnDone)
{
	PerformRequest(TEXT("GET"), FString::Printf(TEXT("/world/residents/%s"), *ResidentId), FString(), false, OnDone);
}

void UNexusWorldStateBridge::RequestConstruction(const FString& Description, TFunction<void(bool, const FString&)> OnDone)
{
	const FString Body = FString::Printf(TEXT("{\"request\":\"%s\"}"), *Description);
	PerformRequest(TEXT("POST"), TEXT("/world/construct"), Body, true, OnDone);
}

void UNexusWorldStateBridge::PerformRequest(const FString& Verb, const FString& Path, const FString& Body, bool bOwnerAuth, TFunction<void(bool, const FString&)> OnDone)
{
	FHttpModule* Http = &FHttpModule::Get();
	TSharedRef<IHttpRequest> Request = Http->CreateRequest();
	Request->SetVerb(Verb);
	Request->SetURL(ApiBaseUrl + Path);
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetHeader(TEXT("X-Nexus-Contract"), ContractVersion);
	if (bOwnerAuth && !OwnerKey.IsEmpty())
	{
		Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + OwnerKey);
	}
	if (!Body.IsEmpty())
	{
		Request->SetContentAsString(Body);
	}

	Request->OnProcessRequestComplete().BindLambda([OnDone](FHttpRequestPtr, FHttpResponsePtr Response, bool bSuccess)
	{
		if (bSuccess && Response.IsValid() && Response->GetResponseCode() >= 200 && Response->GetResponseCode() < 300)
		{
			OnDone(true, Response->GetContentAsString());
		}
		else
		{
			const FString Error = Response.IsValid()
				? FString::Printf(TEXT("HTTP %d: %s"), Response->GetResponseCode(), *Response->GetContentAsString())
				: FString(TEXT("request failed"));
			UE_LOG(LogTemp, Error, TEXT("NexusWorldStateBridge: %s"), *Error);
			OnDone(false, Error);
		}
	});

	if (!Request->ProcessRequest())
	{
		OnDone(false, TEXT("ProcessRequest failed to start"));
	}
}
