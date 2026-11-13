// JARVIS NEXUS - JarvisWorld game target (Master Directive Part 5).
using UnrealBuildTool;
using System.Collections.Generic;

public class JarvisWorldTarget : TargetRules
{
	public JarvisWorldTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
	}
}
