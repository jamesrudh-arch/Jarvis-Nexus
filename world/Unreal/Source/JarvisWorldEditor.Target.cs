// JARVIS NEXUS - JarvisWorld editor target (Master Directive Part 5).
using UnrealBuildTool;
using System.Collections.Generic;

public class JarvisWorldEditorTarget : TargetRules
{
	public JarvisWorldEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
	}
}
