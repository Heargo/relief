; Declarations that may become symbols. The capture name is the symbol kind;
; `@name` is its identifier. Placement (top level, class member) is checked in Rust.
(function_definition name: (identifier) @name) @function
(class_definition name: (identifier) @name) @class
