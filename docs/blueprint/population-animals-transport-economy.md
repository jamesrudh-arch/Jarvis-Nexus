PART 9 — POPULATION AND CIVILISATION SIMULATION

JARVIS is not the only NPC.

Create a persistent population with individual identities, routines, needs, preferences and relationships.

9.1 Inhabitant data model

Every inhabitant requires:

* Unique ID.
* Name.
* Age group.
* Appearance parameters.
* Character model ID.
* Occupation.
* Residence ID.
* Workplace ID.
* Daily schedule.
* Goals.
* Needs.
* Preferences.
* Relationships.
* Event memory.
* Economic role.
* Current activity.
* Current location.

Needs:

* Energy.
* Hunger.
* Social.
* Income.
* Health.

Relationships:

* Family.
* Friends.
* Colleagues.

9.2 Initial population

Create 50 inhabitants:

* Six families, approximately 20 people.
* Four teenagers and students.
* Two teachers.
* One doctor.
* One nurse.
* Two shop workers.
* One shop owner.
* Three drivers.
* Two builders.
* Two public servants.
* Two elderly residents living alone.
* One artist.
* One engineer.
* One researcher.
* Two tourists or visitors.

Every inhabitant must have a home.

Every worker must have a workplace.

9.3 Daily routines

Implement procedural schedules based on occupation, needs, preferences and variation.

Examples:

Teacher:

Wake → Prepare → Travel → Teach → Socialise → Return Home → Sleep.

Shop owner:

Open Shop → Receive Stock → Serve Customers → Manage Staff → Close Shop → Bank Takings → Return Home.

Student:

Attend Classes → Meet Friends → Study → Eat → Return Home.

Delivery Driver:

Collect Packages → Follow Route → Deliver → Return to Depot.

Schedules must not be rigid scripts.

Needs can interrupt schedules.

Every schedule task must complete or record why it did not.

9.4 Animals

Initial slice species:

* Dogs.
* Cats.
* Birds.

Expansion species:

* Horses.
* Cattle.
* Sheep.
* Goats.
* Chickens.
* Deer.
* Foxes.
* Rabbits.
* Fish.
* Reptiles.
* Insects.
* Small mammals.

Every species requires:

* Model.
* Rig.
* Gaits.
* Animation.
* Habitat.
* Feeding.
* Resting.
* Movement.
* Social behaviour.
* Environmental response.
* Population rules.

Animals must never spawn outside valid habitats.

Population must be constrained by food, water and available habitat.

9.5 Transport

Support:

* Cars.
* Taxis.
* Motorcycles.
* Bicycles.
* Buses.
* Trams.
* Trains.
* Trucks.
* Delivery vans.
* Emergency vehicles.
* Boats.
* Ships.
* Pedestrians.

Every vehicle needs a purpose and destination.

Vehicles must:

* Follow routes.
* Obey signals.
* Park.
* Complete journeys.
* Receive new tasks.
* Respond to road closures.
* Reroute after incidents.

No endless driving loops.

Parking must have capacity.

Choose and document one authoritative traffic-state owner.

Use Unreal Chaos for native vehicle physics.

Evaluate external traffic simulators without creating competing state authorities.

PART 10 — ECONOMY AND ENVIRONMENT

10.1 Businesses

Implement persistent businesses with:

* ID.
* Name.
* Owner.
* Employees.
* Location.
* Opening hours.
* Products.
* Inventory.
* Suppliers.
* Prices.
* Revenue.
* Costs.
* Customers.
* Operational state.

Business states:

* Open.
* Closed.
* Understocked.

Rules:

* Closed businesses receive no customers.
* Out-of-stock items cannot be sold.
* Staffing constrains capacity.
* Sales reduce inventory.
* Revenue increases from sales.
* Wages and costs reduce profit.
* Transactions conserve money.

10.2 World time

Default:

One simulated world day = 24 real minutes at 1x.

Support:

* Pause.
* 1x.
* 10x.
* 100x.

Calendar:

Four seasons of 91 days.

Implement:

* Sun.
* Moon.
* Seasonal lighting.
* Weather.
* Climate.
* Regional environmental variation.

Weather:

* Clear.
* Cloud.
* Rain.
* Storm.
* Fog.
* Snow.
* Wind.

10.3 Infrastructure

Implement:

* Power grid.
* Water supply.
* Waste collection.
* District utilities.
* Environmental events.

Events must have measurable consequences.

Examples:

Heavy rain → Traffic slows, pedestrians decrease, flood risk increases.

Accident → Road closes, traffic reroutes.

Power failure → Lights switch off, businesses close.

Water shortage → Residents and farms are affected.

Public event → Crowds gather, commercial demand changes.

Economic shock → Prices and staffing change.

Season change → Vegetation and animal behaviour change.

Every event requires:

* Timestamp.
* Cause.
* Effects.
* Affected entities.
* Persistent event history.

F. CARLA

https://github.com/carla-simulator/carla

Evaluate and integrate where justified for vehicle and autonomous-driving simulation.

G. SUMO

https://github.com/eclipse-sumo/sumo

Evaluate traffic-network simulation, routing and traffic flow.

H. Mesa

https://github.com/mesa/mesa

Evaluate agent-based simulation for civilisation and population modelling.

I. PettingZoo

https://github.com/Farama-Foundation/PettingZoo

Evaluate multi-agent reinforcement-learning environments where appropriate.

CARLA, SUMO, Mesa and PettingZoo must not create competing authoritative state systems.

Choose one owner for each domain.
