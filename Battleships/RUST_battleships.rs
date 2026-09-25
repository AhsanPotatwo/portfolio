//import the neccesary libraries
use rand::Rng;
use std::collections::HashSet;
use std::io;

//define the maximum grid size in a constant
const MAX_GRID_SIZE: usize = 10;

//the grid being defined. It's a 2d vector of characters
//each charater can either be "s","x" or "o"
type Grid = Vec<Vec<char>>;
//this represents a grid coordinate
type Position = (usize, usize);

//this is the main game loop, the entrypoint for the game
fn main() {
    println!("Welcome to Battleships!");
    
    //this is asking the player for the grid size
    let grid_size = get_grid_size();
    
    //this is asking the player for the number of ships they want on the board
    let num_ships = get_num_ships(grid_size);
    
    //generates random locations for the ships using a recursive function
    let player_ships = place_ships(grid_size, num_ships, HashSet::new());
   
    //places ships but on the computer board
    let computer_ships = place_ships(grid_size, num_ships, HashSet::new());

    //draws the player's grid
    let player_grid = initialize_grid_with_ships(grid_size, &player_ships);
    //draws the computer's grid
    let computer_grid = initialize_grid(grid_size);
    
    //randomises the computer's guesses
    let computer_guesses = HashSet::new();
    
    //starts the main gameplay loop
    game_loop(grid_size, player_grid, computer_grid, player_ships, computer_ships, computer_guesses);
}

//This promps the user to input a correct grid size
//and loops until the user does so
fn get_grid_size() -> usize {
    loop {
        println!("Enter the size of the board (1 to {}):", MAX_GRID_SIZE);
        match read_input().parse::<usize>() {
            Ok(size) if size > 0 && size <= MAX_GRID_SIZE => return size,
            _ => println!("Invalid input. Try again."),
        }
    }
}

//similar to the grid size but this makes sure
//that the number of ships doesn't exceed the
//amount of grid cells
fn get_num_ships(grid_size: usize) -> usize {
    let max_ships = grid_size * grid_size;
    loop {
        println!("Enter the number of ships (1 to {}):", max_ships);
        match read_input().parse::<usize>() {
            Ok(num_ships) if num_ships > 0 && num_ships <= max_ships => return num_ships,
            _ => println!("Invalid input. Try again."),
        }
    }
}

//creates a grid of the chosen size filled with the "~" character
fn initialize_grid(size: usize) -> Grid {
    vec![vec!['~'; size]; size]
}

//adds an s to the grid based on where the ships were placed
fn initialize_grid_with_ships(size: usize, ships: &HashSet<Position>) -> Grid {
    let mut grid = initialize_grid(size);
    for &(x, y) in ships {
        grid[x][y] = 'S';
    }
    grid
}

//recursively adds randomly generated values to ships until the
//required number is reached
fn place_ships(grid_size: usize, num_ships: usize, ships: HashSet<Position>) -> HashSet<Position> {
    if ships.len() == num_ships {
        ships
    } else {
        let x = rand::thread_rng().gen_range(0..grid_size);
        let y = rand::thread_rng().gen_range(0..grid_size);
        place_ships(grid_size, num_ships, ships.into_iter().chain([(x, y)].iter().cloned()).collect())
    }
}

//the main layout of the game
fn game_loop(
    grid_size: usize,
    player_grid: Grid,
    computer_grid: Grid,
    player_ships: HashSet<Position>,
    computer_ships: HashSet<Position>,
    computer_guesses: HashSet<Position>,
) {
    //the player wins if the other board is empty
    if computer_ships.is_empty() {
        println!("\nCongratulations! You win!");
        return;
    }
    
    //the computer wins if the player's board is empty
    if player_ships.is_empty() {
        println!("\nThe computer wins! Better luck next time.");
        return;
    }
    
    //prints both grids, allowing the player's grid
    //to be visible but not the computer's grid
    println!("\nPlayer's Grid:");
    print_grid(&player_grid, true);
    println!("\nComputer's Grid:");
    print_grid(&computer_grid, false);

    //takes the player's guess
    println!("Your turn! Enter your guess (row and column, e.g., 2 3):");
    let (x, y) = get_coordinates(grid_size);
    let (computer_grid, computer_ships) = process_guess(computer_grid, computer_ships, (x, y), "Computer's");

    //takes the computer's guess randomly
    let computer_guess = make_computer_guess(grid_size, &computer_guesses);
    let (player_grid, player_ships) = process_guess(player_grid, player_ships, computer_guess, "Your");

    game_loop(
        grid_size,
        player_grid,
        computer_grid,
        player_ships,
        computer_ships,
        computer_guesses.into_iter().chain([computer_guess].iter().cloned()).collect(),
    );
}

//updates the grid based on where the player guesses
fn process_guess(
    mut grid: Grid,
    mut ships: HashSet<Position>,
    guess: Position,
    owner: &str,
) -> (Grid, HashSet<Position>) {
    let (x, y) = guess;
    if ships.contains(&guess) {
        println!("{} ship is hit at ({}, {})!", owner, x, y);
        grid[x][y] = 'X';
        ships.remove(&guess);
    } else {
        println!("{} misses at ({}, {}).", owner, x, y);
        grid[x][y] = 'O';
    }
    (grid, ships)
}

//guesses a position that hasn't been guessed before
fn make_computer_guess(grid_size: usize, guesses: &HashSet<Position>) -> Position {
    let mut rng = rand::thread_rng();
    loop {
        let guess = (rng.gen_range(0..grid_size), rng.gen_range(0..grid_size));
        if !guesses.contains(&guess) {
            return guess;
        }
    }
}

//prints the grid but with the option of hiding where the ships are
fn print_grid(grid: &Grid, reveal_ships: bool) {
    let size = grid.len();

    print!("  ");
    for i in 0..size {
        print!("{} ", i);
    }
    println!();

//numbers the grids with the enumerate function
    for (i, row) in grid.iter().enumerate() {
        print!("{} ", i);
        for &cell in row {
            if cell == 'S' && !reveal_ships {
                print!("~ ");
            } else {
                print!("{} ", cell);
            }
        }
        println!();
    }
}

//validation for entering the coordinates
fn get_coordinates(grid_size: usize) -> Position {
    loop {
        let input = read_input();
        let parts: Vec<&str> = input.split_whitespace().collect();
        if parts.len() == 2 {
            if let (Ok(x), Ok(y)) = (parts[0].parse::<usize>(), parts[1].parse::<usize>()) {
                if x < grid_size && y < grid_size {
                    return (x, y);
                }
            }
        }
        println!("Invalid coordinates. Try again.");
    }
}

fn read_input() -> String {
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    input.trim().to_string()
}