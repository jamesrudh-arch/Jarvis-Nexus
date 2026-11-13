// JARVIS NEXUS - primary game module implementation (Master Directive Part 5).
#include "JarvisWorld.h"
#include "Modules/ModuleManager.h"

DEFINE_LOG_CATEGORY(LogJarvisWorld);

void FJarvisWorldModule::StartupModule()
{
	UE_LOG(LogJarvisWorld, Log, TEXT("JarvisWorld module online (JARVIS NEXUS, Phase 3)."));
}

void FJarvisWorldModule::ShutdownModule()
{
	UE_LOG(LogJarvisWorld, Log, TEXT("JarvisWorld module going down."));
}

IMPLEMENT_PRIMARY_GAME_MODULE(FJarvisWorldModule, JarvisWorld, "JarvisWorld");
