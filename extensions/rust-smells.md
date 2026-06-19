# Rust Code Smells & Idiomatic Anti-Patterns

This document compiles common Rust anti-patterns, anti-idioms, and mental model traps that often compile successfully but represent a misunderstanding of "The Rust Way."

---

## 1. Error Handling Traps

### ❌ Anti-Pattern: Excessive use of `.unwrap()`

Using `.unwrap()` indiscriminately because handling errors properly feels verbose during early development. This introduces hidden runtime panics into production.

```rust
// Bad: Will crash the thread at runtime if parsing fails
let number: i32 = "invalid_num".parse().unwrap(); 

```

### ⛵ Idiomatic Fix: Use Pattern Matching, Fallbacks, or the `?` Operator

Handle the potential failure explicitly.

```rust
// Good: Using pattern matching
match "123".parse::<i32>() {
    Ok(num) => println!("Success: {num}"),
    Err(e)  => eprintln!("Failed to parse: {e}"),
}

// Good: Using fallbacks
let number = "invalid_num".parse::<i32>().unwrap_or(0);

// Good: Propagating via the `?` operator (inside a function returning Result)
fn parse_config(input: &str) -> Result<i32, std::num::ParseIntError> {
    let number = input.parse::<i32>()?;
    Ok(number)
}

```

### ❌ Anti-Pattern: Using Sentinel Values (Returning `-1` or `""`)

Carrying over habits from C/C++ or JavaScript where an absent value or an error is represented by magic numbers or empty strings.

```rust
// Bad: Forces the caller to remember to check for -1
fn find_index(target: &str, items: &[&str]) -> i32 {
    for (i, &item) in items.iter().enumerate() {
        if item == target { return i as i32; }
    }
    -1 
}

```

### ⛵ Idiomatic Fix: Leverage `Option<T>`

```rust
// Good: Type safety forces the consumer to handle the missing case
fn find_index(target: &str, items: &[&str]) -> Option<usize> {
    items.iter().position(|&item| item == target)
}

```

---

## 2. API Design & Type Architecture

### ❌ Anti-Pattern: Unnecessary Indirection (`&String` or `&Vec<T>`)

Accepting heap-allocated smart pointer references in function signatures when you only need to read the underlying data.

```rust
// Bad: Forces extra pointer indirection and limits inputs to owned Strings
fn process_title(title: &String) {
    println!("{}", title);
}

```

### ⛵ Idiomatic Fix: Use Borrow Slices (`&str` and `&[T]`)

Leverage Rust's *Deref Coercion*. This allows the function to accept both literal slices and borrowed owned collections seamlessly.

```rust
// Good: Accepts &String, &str, and string literals directly
fn process_title(title: &str) {
    println!("{}", title);
}

```

### ❌ Anti-Pattern: The Two-State "Uninitialized" Object Trap

Constructing an empty object and initializing its values after the fact, creating an implicitly invalid intermediate state.

```rust
// Bad: Dictionary exists in an invalid/empty state between line 1 and 2
let mut dict = Dictionary::new();
dict.load_from_file("words.txt")?; 

```

### ⛵ Idiomatic Fix: Parse, Don't Validate (Valid by Construction)

Design your types so they can only be instantiated if they are fully valid and populated.

```rust
// Good: The type is immutable and guaranteed to be valid from creation
let dict = Dictionary::from_file("words.txt")?;

```

### ❌ Anti-Pattern: Hardcoded File Inputs

Binding your business logic directly to file system layouts, which ruins testability and reusability.

```rust
// Bad: Cannot be tested using in-memory mock data
fn parse_data(filename: &str) -> io::Result<()> {
    let file = File::open(filename)?;
    // parsing logic here
    Ok(())
}

```

### ⛵ Idiomatic Fix: Use Trait Bounds (`impl Read`)

```rust
// Good: Can read from a File, a network socket, or an in-memory byte slice
fn parse_data(mut reader: impl std::io::Read) -> io::Result<()> {
    let mut buffer = String::new();
    reader.read_to_string(&mut buffer)?;
    Ok(())
}

```

---

## 3. String & Path Manipulation

### ❌ Anti-Pattern: Treating Paths as Strings

Using string interpolation macros like `format!` to construct OS file system paths.

```rust
// Bad: Prone to OS-specific path separator bugs and invalid UTF-8 panics
let path = format!("{}/{}.json", directory, filename);

```

### ⛵ Idiomatic Fix: Use `Path` and `PathBuf`

```rust
use std::path::Path;

// Good: Correctly cross-platform across Unix and Windows systems
let path = Path::new(directory).join(filename).with_extension("json");

```

### ❌ Anti-Pattern: Inefficient String Concatenation Loops

Using the `+` operator or `format!` iteratively inside a loop, forcing repeated allocation and data copying.

```rust
// Bad: Allocates a brand new string layout on every iteration
let mut result = String::new();
for s in strings {
    result = result + s; 
}

```

### ⛵ Idiomatic Fix: `join` or Pre-allocated `push_str`

```rust
// Good option A: Clean collection joining
let result = strings.join("");

// Good option B: Stateful allocations with a pre-reserved capacity size
let mut result = String::with_capacity(total_estimated_bytes);
for s in strings {
    result.push_str(s);
}

```

---

## 4. Lifetimes & Memory Mismanagement

### ❌ Anti-Pattern: Unnecessary Heap Cloning

Calling `.clone()` on data structures solely to satisfy the borrow checker when a temporary reference would suffice.

```rust
// Bad: Duplicates heap data unnecessarily
let s1 = String::from("hello");
let s2 = s1.clone(); 
println!("s1 = {}, s2 = {}", s1, s2);

```

### ⛵ Idiomatic Fix: Borrow via References

```rust
// Good: Shared read access without performance overhead
let s1 = String::from("hello");
let s2 = &s1;
println!("s1 = {}, s2 = {}", s1, s2);

```

### ❌ Anti-Pattern: Overusing Smart Pointers (`Rc<RefCell<T>>`)

Replicating architectural styles from Object-Oriented/Garbage-Collected languages by wrapping structures in nested smart pointers just to dodge ownership constraints.

```rust
// Bad: Defers borrow checking to runtime, risking sudden panics and deadlocks
struct GraphNode {
    data: Rc<RefCell<NodeData>>,
}

```

### ⛵ Idiomatic Fix: Rethink Ownership Architecture

Change the structure topology. Use unique indices pointing into a central collection vector (`Vec<NodeData>`) rather than building self-referential graph pointers.

```rust
// Good: One owner (a central Vec), relationships expressed as indices.
//       Borrow checking stays at compile time, with no runtime panics.
struct NodeData {
    value: i32,
    neighbors: Vec<usize>, // index-based edges, not pointers
}

struct Graph {
    nodes: Vec<NodeData>, // single source of truth
}

impl Graph {
    fn connect(&mut self, a: usize, b: usize) {
        self.nodes[a].neighbors.push(b);
        self.nodes[b].neighbors.push(a);
    }
}
```

### ❌ Anti-Pattern: Overextending Conflicting Reference Lifetimes

Keeping an immutable reference open in a wide scope while attempting a mutable mutation on the same resource.

```rust
let mut data = vec![1, 2, 3];
let first = &data[0]; // Immutable borrow begins

data.push(4); // ❌ COMPILE ERROR: Cannot borrow as mutable while immutably borrowed

println!("The first element is: {}", first); // Immutable borrow ends here

```

### ⛵ Idiomatic Fix: Isolate Reference Usage (NLL Optimization)

Re-order or structure variables so that immutable borrows naturally expire before mutations happen.

```rust
let mut data = vec![1, 2, 3];

let first = &data[0]; 
println!("The first element is: {}", first); // Immutable borrow ends right here

data.push(4); // ✅ Allowed! No overlapping reference conflicts exist anymore
```
