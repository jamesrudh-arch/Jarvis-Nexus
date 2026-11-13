// JARVIS NEXUS - JarvisWorld primary runtime module (Master Directive Part 5).
using UnrealBuildTool;

public class JarvisWorld : ModuleRules
{
	public JarvisWorld(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine"
		});
	}
}
