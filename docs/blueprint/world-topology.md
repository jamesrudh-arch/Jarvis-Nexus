PART 4 — THE WORLD: A COMPLETE PERSISTENT CIVILISATION

This is one of the most important requirements.

Do not build a single room, a laboratory, a demonstration scene or an isolated city.

Build an expandable world containing interconnected:

* Continents and regions.
* Cities.
* Towns.
* Villages.
* Districts.
* Roads.
* Highways.
* Railways.
* Waterways.
* Mountains.
* Forests.
* Lakes.
* Rivers.
* Farms.
* Industrial facilities.
* Residential neighbourhoods.
* Commercial areas.
* Public infrastructure.
* Buildings.
* Interiors.
* People.
* Animals.
* Vehicles.
* Businesses.
* Utilities.

The civilisation must continue operating independently of JARVIS.

It must have persistent state, historical events, economic activity and inhabitants with individual identities.

4.1 WORLD GEOGRAPHY DIAGRAM

Use the following as the master geographical topology.

                         NORTH
                           ^
                           |
              +-------------------------+
              |    NORTHERN HIGHLANDS   |
              |                         |
              | Mountains / Forests     |
              | Lakes                   |
              |                         |
              | [HIGHLAND CITY]         |
              |       |                 |
              |   [NORTH TOWN]          |
              +-------|-----------------+
                      |
                 NORTH HIGHWAY
                      |
    +-----------------+------------------+
    |                 |                  |
    v                 v                  v
+---------------+ +----------------+ +----------------+
| WESTERN       | | CENTRAL        | | EASTERN        |
| INDUSTRIAL    | | METROPOLITAN   | | TECHNOLOGY     |
|               | |                | |                |
| [WEST CITY]---|-[CAPITAL CITY]---|-[EAST CITY]      |
|               | |                | |                |
| Manufacturing | | Government     | | Research       |
| Logistics     | | Finance         | | University     |
| Farms         | | Parks           | | Reservoir      |
+---------------+ +--------|-------+ +----------------+
                           |
                     SOUTH HIGHWAY
                           |
              +------------+------------+
              | SOUTHERN AGRICULTURAL   |
              |                         |
              | [SOUTHERN CITY]         |
              | Farms / Villages        |
              | Logistics               |
              +------------|------------+
                           |
                    COAST ROAD
                     FREIGHT RAIL
                           |
              +------------+------------+
              | COASTAL MARITIME        |
              |                         |
              | [PORT CITY]             |
              | Harbour / Shipyards     |
              | Logistics / Fishing      |
              +------------|------------+
                           |
                       OPEN OCEAN

This is the initial world topology, not the final visual map.

Generate actual geographical data, SVG master maps, regional maps and district maps.

Never substitute empty GeoJSON files or decorative diagrams for actual geographic implementation.

4.2 Geographic standards

Atlas storage:

* CRS: EPSG:4326.
* Fictional geographic anchor: latitude 45.0, longitude 10.0.
* Local metric coordinate system: Transverse Mercator.
* Capital City centre: local origin (0,0).
* Default world extent: 400 km east-west, 600 km north-south.
* Unreal conversion: 1 metre = 100 Unreal units.
* Unreal X = east.
* Unreal Y = south.
* Unreal Z = up.

Create one authoritative coordinate conversion function.

Test round-trip accuracy to within 1 cm.

World Partition:

* 512 m cells.
* Large World Coordinates.

Every entity must have persistent identifiers.

Examples:

* REG-001
* CTY-001
* DST-001
* RDS-001
* BLD-001
* WTR-001
* PRK-001

4.3 Six mandatory regions

ID	Region	Centre (E,N km)	Primary identity
REG-001	Northern Highlands	(0,+220)	Mountains, tourism, timber
REG-002	Western Industrial	(-120,0)	Manufacturing, logistics
REG-003	Central Metropolitan	(0,0)	Government, finance, culture
REG-004	Eastern Technology	(+120,0)	Research, software, education
REG-005	Southern Agricultural	(0,-150)	Farming, food processing
REG-006	Coastal Maritime	(0,-280)	Shipping, fishing, shipyards

Regional population targets:

* Highlands: 150,000.
* Western: 400,000.
* Central: 900,000.
* Eastern: 450,000.
* Southern: 300,000.
* Coastal: 350,000.

These are expansion targets, not the active slice population.

Every region requires distinct:

* Architecture.
* Vegetation.
* Climate.
* Animal species.
* Industries.
* Occupations.
* Terrain.
* Environmental identity.

4.4 Seven mandatory settlements

ID	Settlement	Region
CTY-001	Capital City	Central
CTY-002	Western Industrial City	Western
CTY-003	Eastern Technology City	Eastern
CTY-004	Southern Regional City	Southern
CTY-005	Coastal Port City	Coastal
CTY-006	Northern Highland City	Highlands
TWN-001	North Town	Highlands

Additionally, create at least eight villages along rural roads in the Western, Southern and Highland regions.

Every village must follow the village template.

Minimum 40 buildings per village.

Minimum 200 buildings per town.

4.7 Terrain and water

Implement:

* Mountain elevation.
* Forest distribution.
* Rivers.
* Lakes.
* Reservoirs.
* Coastline.
* Harbour depth.
* Floodplains.

Rivers flow downhill from the Highlands through the Capital towards the Port City.

Every river must have monotonic elevation.

Road gradients:

* Highways: maximum 8%.
* Local roads: maximum 12%.

Flooding must only affect valid floodplains adjacent to rivers or the coast.

PART 5 — UNREAL ENGINE 5: PRIMARY WORLD ENGINE

Unreal Engine 5 is the mandatory primary world engine.

Three.js is not a replacement.

Mandatory repository

Epic Games Unreal Engine:

https://github.com/EpicGames/UnrealEngine

Access requires the appropriate authorised GitHub/Epic account permissions.

Requirements

Create and implement:

world/Unreal/JarvisWorld.uproject

Build:

* Unreal project structure.
* Required modules.
* Configuration.
* World Partition.
* Large World Coordinates.
* Test map.
* Landscape.
* Roads.
* Buildings.
* Lighting.
* Navigation.
* Character systems.
* World streaming.
* Simulation integration.
* Persistent world connections.

Implement the actual Unreal project, not merely an empty .uproject.

Unreal API and remote integration

Inspect the available authorised Epic/EOS credentials and integration configuration.

Where an API or authorised remote build capability is available:

1. Identify the exact capability.
2. Authenticate securely.
3. Test connectivity.
4. Provision or connect the required resources.
5. Configure the project.
6. Execute actual build or deployment operations.
7. Verify the resulting project and runtime.

Do not assume an EOS token is equivalent to Unreal Engine source access, a build environment or a hosted Unreal runtime.

Do not invent API capabilities.

If Unreal cannot run in the current environment, continue developing the Unreal project, scripts, configuration, assets and integration code. Record the exact missing executable or permission and provide the commands required on the designated machine.

Unreal implementation requirements

Use appropriate native systems:

* World Partition.
* Landscape.
* PCG.
* Mass Entity.
* StateTree.
* Animation Blueprints.
* Control Rig.
* IK.
* Chaos.
* Navigation System.
* Lumen where appropriate.
* Nanite where appropriate.

Select systems based on actual requirements and performance.

A. Unreal Engine

https://github.com/EpicGames/UnrealEngine

Primary real-time world engine.

Implement the actual Unreal project and connect it to NEXUS.
