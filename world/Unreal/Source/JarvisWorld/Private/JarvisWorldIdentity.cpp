// JARVIS NEXUS - persistent entity identity implementation.
#include "JarvisWorldIdentity.h"

FString UJarvisIdentityLibrary::FormatEntityId(const FJarvisEntityId& Id)
{
	if (!Id.IsValid())
	{
		return FString();
	}
	FString NumberPart;
	if (Id.Number < 1000)
	{
		NumberPart = FString::Printf(TEXT("%03d"), Id.Number);
	}
	else
	{
		NumberPart = FString::Printf(TEXT("%d"), Id.Number);
	}
	return Id.Prefix + TEXT("-") + NumberPart;
}

bool UJarvisIdentityLibrary::TryParseEntityId(const FString& Raw, FJarvisEntityId& OutId)
{
	OutId = FJarvisEntityId();
	const FString Trimmed = Raw.TrimStartAndEnd();
	if (Trimmed.IsEmpty())
	{
		return false;
	}

	int32 DashIndex;
	if (!Trimmed.FindChar(TEXT('-'), DashIndex))
	{
		return false;
	}
	const FString Prefix = Trimmed.Left(DashIndex);
	const FString NumberPart = Trimmed.Right(Trimmed.Len() - DashIndex - 1);

	if (Prefix.Len() < 2 || Prefix.Len() > 4)
	{
		return false;
	}
	for (int32 i = 0; i < Prefix.Len(); ++i)
	{
		const TCHAR Ch = Prefix[i];
		if (Ch < TEXT('A') || Ch > TEXT('Z'))
		{
			return false;
		}
	}
	if (!NumberPart.IsNumeric() || NumberPart.Len() > 6)
	{
		return false;
	}
	const int32 Number = FCString::Atoi(*NumberPart);
	if (Number < 1)
	{
		return false;
	}

	OutId.Prefix = Prefix;
	OutId.Number = Number;
	return true;
}

FJarvisEntityId UJarvisIdentityLibrary::MakeEntityId(const FString& Prefix, int32 Number)
{
	FJarvisEntityId Id;
	Id.Prefix = Prefix;
	Id.Number = Number;
	return Id;
}

TArray<FString> UJarvisIdentityLibrary::GetKnownPrefixes()
{
	TArray<FString> Out;
	Out.Add(TEXT("REG")); // region
	Out.Add(TEXT("CTY")); // city
	Out.Add(TEXT("DST")); // district
	Out.Add(TEXT("RDS")); // road
	Out.Add(TEXT("BLD")); // building
	Out.Add(TEXT("WTR")); // waterway
	Out.Add(TEXT("PRK")); // park
	Out.Add(TEXT("TWN")); // town (blueprint 4.4)
	return Out;
}
