; Declarations that may become symbols. The capture name is the symbol kind;
; `@name` is its identifier. Placement (top level, class member) is checked in Rust.
(function_declaration name: (identifier) @name) @function
(generator_function_declaration name: (identifier) @name) @function
(class_declaration name: (_) @name) @class
(abstract_class_declaration name: (_) @name) @class
(interface_declaration name: (_) @name) @type
(type_alias_declaration name: (_) @name) @type
(enum_declaration name: (_) @name) @enum
(variable_declarator name: (identifier) @name) @variable
(method_definition name: (_) @name) @method
(abstract_method_signature name: (_) @name) @method
