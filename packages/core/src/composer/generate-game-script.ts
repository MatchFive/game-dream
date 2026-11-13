export function generateGameScript(): string {
  return `extends Node

signal service_registered(service_name: String, service: Node)

var services: Dictionary = {}
var events: Node = null

func register_event_bus(bus: Node) -> void:
	events = bus

func register_service(service_name: String, service: Node) -> void:
	services[service_name] = service
	service_registered.emit(service_name, service)

func get_service(service_name: String) -> Node:
	return services.get(service_name, null)

func has_service(service_name: String) -> bool:
	return services.has(service_name)
`;
}
