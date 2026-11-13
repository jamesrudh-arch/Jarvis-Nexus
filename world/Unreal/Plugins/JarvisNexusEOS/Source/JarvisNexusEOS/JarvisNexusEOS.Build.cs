// Copyright (c) JARVIS NEXUS. All Rights Reserved.

using UnrealBuildTool;

public class JarvisNexusEOS : ModuleRules
{
    public JarvisNexusEOS(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "Projects",
        });

        // EOS SDK integration — exact external execution requirement:
        // 1. Download the Epic Online Services SDK (Unified Windows/Linux)
        //    from https://dev.epicgames.com/portal → your product → EOS SDK.
        // 2. Extract to: Plugins/JarvisNexusEOS/ThirdParty/EOSSDK/
        //       (containing Include/ and Lib/ per platform)
        // 3. The module compiles the SDK wrapper ONLY when the headers are
        //    present (EOS_SDK_PRESENT define below); without it the plugin
        //    still builds and reports "SDK not installed" at runtime —
        //    never a fake "connected" state.
        string EosSdkRoot = System.IO.Path.Combine(PluginDirectory, "ThirdParty", "EOSSDK");
        string EosSdkInclude = System.IO.Path.Combine(EosSdkRoot, "Include");
        bool bEosSdkPresent = System.IO.Directory.Exists(EosSdkInclude);

        if (bEosSdkPresent)
        {
            PublicDefinitions.Add("EOS_SDK_PRESENT=1");
            PublicIncludePaths.Add(EosSdkInclude);

            if (Target.Platform == UnrealTargetPlatform.Win64)
            {
                string LibDir = System.IO.Path.Combine(EosSdkRoot, "Lib", "Win64", "Release");
                PublicAdditionalLibraries.Add(System.IO.Path.Combine(LibDir, "EOSSDK.lib"));
                RuntimeDependencies.Add(System.IO.Path.Combine(LibDir, "EOSSDK.dll"));
            }
            else if (Target.Platform == UnrealTargetPlatform.Linux)
            {
                string LibDir = System.IO.Path.Combine(EosSdkRoot, "Lib", "Linux-x64", "Release");
                PublicAdditionalLibraries.Add(System.IO.Path.Combine(LibDir, "libEOSSDK.so"));
                RuntimeDependencies.Add(System.IO.Path.Combine(LibDir, "libEOSSDK.so"));
            }
        }
        else
        {
            System.Console.WriteLine("[JarvisNexusEOS] EOS SDK not found at ThirdParty/EOSSDK — building in NO-SDK mode (runtime reports 'not installed').");
        }
    }
}
