// JARVIS NEXUS — Epic Online Services platform module.
// Credential flow: EOS_Platform_Create with ClientId/ClientSecret/ProductId/
// DeploymentId sourced from the JARVIS CORE integration registry
// (src/lib/nexus/integrations/eos.ts exposes them; the editor reads them from
//  jarvis_nexus_eos.json placed next to the plugin — see README).
//
// THERE IS NO REST ENDPOINT FOR EOS AUTH: verification happens here, inside
// EOS_Platform_Create + EOS_Auth_Login, at engine runtime.

#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class JARVISNEXUSEOS_API FJarvisNexusEOSModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;

    /** True when the EOS SDK was compiled in and the platform was created. */
    static bool IsPlatformReady();

    /** Last platform/logon result, for the connections panel (honest state). */
    static FString GetStatusText();

private:
#if EOS_SDK_PRESENT
    void CreatePlatformFromConfig();
#endif
};
