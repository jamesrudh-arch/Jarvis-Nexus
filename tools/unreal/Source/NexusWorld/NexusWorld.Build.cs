// NexusWorld module build rules (UE 5.8+)
using UnrealBuildTool;

public class NexusWorld : ModuleRules
{
	public NexusWorld(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"HTTP",
			"Json"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"InputCore",
			"UMG"
		});
	}
}
