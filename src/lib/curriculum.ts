// The curriculum, for parents (/curriculum). 30 levels from the BC curriculum, Kindergarten to Grade 9. Grades are
// internal: never map a single level to a grade, on this page or on a workbook. Each group shows a rough range only. Source: the curriculum skeleton
// (Unica Learning - Curriculum Skeleton.xlsx), built from the skill map in src/lib/assessment/skill-map.

export interface CurriculumLevel { n: number; title: string; points: string[] }
/** `about`: the rough school-grade range of the whole group, for parents. Never shown per level. */
export interface CurriculumGroup { name: string; about: string; levels: CurriculumLevel[] }

export const CURRICULUM_GROUPS: CurriculumGroup[] = [
  {
    "name": "Levels 1–9",
    "about": "About Kindergarten to Grade 2",
    "levels": [
      {
        "n": 1,
        "title": "Counting to 10 and first patterns",
        "points": [
          "Counting objects to 10, one number for each",
          "Reading and writing the numbers 0 to 10",
          "Copying and continuing simple patterns",
          "Talking about what will or won't happen"
        ]
      },
      {
        "n": 2,
        "title": "Making 5 and comparing",
        "points": [
          "Seeing small amounts without counting",
          "Ways to make 5, and which group has more",
          "Comparing what is longer, heavier or holds more",
          "Describing and sorting shapes"
        ]
      },
      {
        "n": 3,
        "title": "Taking numbers apart",
        "points": [
          "Splitting numbers to 10 into two parts",
          "Adding and taking away with objects and pictures",
          "Equal and not equal, like a balance",
          "First picture graphs and getting to know coins"
        ]
      },
      {
        "n": 4,
        "title": "Numbers to 20 and making 10",
        "points": [
          "Counting, reading and writing numbers to 20",
          "Numbers to 20 on a number line, and which is bigger",
          "All the ways to make 10",
          "Words for how likely something is"
        ]
      },
      {
        "n": 5,
        "title": "First adding and subtracting",
        "points": [
          "What adding and taking away mean",
          "Adding and subtracting to 20 with doubles and making 10",
          "Families of related facts",
          "Story problems and how an amount changes"
        ]
      },
      {
        "n": 6,
        "title": "Patterns, measuring and shapes",
        "points": [
          "Sorting rules and repeating patterns",
          "Equal and not equal, and making both sides match",
          "Measuring length with blocks and paper clips",
          "Naming shapes, simple graphs and what each coin is worth"
        ]
      },
      {
        "n": 7,
        "title": "Numbers to 100 and patterns",
        "points": [
          "Tens and ones in numbers to 100",
          "Using 25, 50 and 100 as landmarks",
          "Repeating and growing patterns",
          "Making and reading picture graphs"
        ]
      },
      {
        "n": 8,
        "title": "Quick facts, missing numbers and shapes",
        "points": [
          "Quick ways to add and subtract to 20",
          "Finding a missing number",
          "Using =, < and > correctly",
          "Shapes and the faces of solid objects"
        ]
      },
      {
        "n": 9,
        "title": "Adding to 100, rulers and money",
        "points": [
          "Adding and subtracting two-digit numbers",
          "Story problems with numbers to 100",
          "Measuring with a ruler in centimetres and metres",
          "Counting coins to one dollar, spending and saving"
        ]
      }
    ]
  },
  {
    "name": "Levels 10–18",
    "about": "About Grades 3 to 5",
    "levels": [
      {
        "n": 10,
        "title": "Numbers to 1000 and bigger sums",
        "points": [
          "Hundreds, tens and ones",
          "Adding and subtracting three-digit numbers",
          "Quick recall of facts to 20",
          "Patterns that grow and shrink"
        ]
      },
      {
        "n": 11,
        "title": "Groups, sharing and number puzzles",
        "points": [
          "Equal groups, arrays and fair sharing",
          "Number sentences with a missing number",
          "Pattern rules in words and numbers",
          "Graphs, tallies and money to $100"
        ]
      },
      {
        "n": 12,
        "title": "Fractions, measuring and time",
        "points": [
          "Halves, thirds, fourths and more",
          "Metres, grams and litres; area and perimeter",
          "Minutes, hours, days and weeks",
          "Faces, edges and nets of 3D objects"
        ]
      },
      {
        "n": 13,
        "title": "Numbers to 10 000 and times tables",
        "points": [
          "Numbers to 10 000",
          "Adding and subtracting four-digit numbers",
          "Learning the times tables",
          "Polygons and lines of symmetry"
        ]
      },
      {
        "n": 14,
        "title": "Multiplying, dividing and fractions",
        "points": [
          "Multiplying and dividing larger numbers by one digit",
          "Comparing and ordering fractions",
          "Telling time on analog and digital clocks",
          "Finding perimeter"
        ]
      },
      {
        "n": 15,
        "title": "Decimals and making change",
        "points": [
          "Tenths and hundredths",
          "Adding and subtracting decimals",
          "Making change with money",
          "Graphs and simple chance experiments"
        ]
      },
      {
        "n": 16,
        "title": "Big numbers and multiplication facts",
        "points": [
          "Reading and writing numbers to a million",
          "Fluent multiplication facts",
          "Pattern rules with symbols",
          "Area of squares and rectangles"
        ]
      },
      {
        "n": 17,
        "title": "Long multiplying and dividing",
        "points": [
          "Multiplying and dividing with bigger numbers",
          "Fractions that are worth the same",
          "Simple equations with a letter",
          "How long things take"
        ]
      },
      {
        "n": 18,
        "title": "Decimals to thousandths and moving shapes",
        "points": [
          "Decimals to thousandths",
          "Comparing fractions and decimals",
          "Money problems to $1000",
          "Prisms, pyramids and moving shapes"
        ]
      }
    ]
  },
  {
    "name": "Levels 19–30",
    "about": "About Grades 6 to 9",
    "levels": [
      {
        "n": 19,
        "title": "Factors, multiples and angles",
        "points": [
          "Factors, multiples and the order of operations",
          "Very large and very small numbers",
          "Measuring and naming angles",
          "Chance as a fraction"
        ]
      },
      {
        "n": 20,
        "title": "Mixed numbers, decimals and area",
        "points": [
          "Mixed numbers and improper fractions",
          "Multiplying and dividing decimals",
          "Area of triangles and parallelograms",
          "Solving one-step equations"
        ]
      },
      {
        "n": 21,
        "title": "Ratios, percents and volume",
        "points": [
          "Ratios and percents",
          "Sale prices and simple budgets",
          "Volume and capacity",
          "Patterns shown as tables and graphs"
        ]
      },
      {
        "n": 22,
        "title": "Negative numbers, fractions and percents",
        "points": [
          "Adding, subtracting, multiplying and dividing negative numbers",
          "Fractions in lowest terms",
          "Switching between fractions, decimals and percents",
          "Comparing fractions, decimals and percents on a number line"
        ]
      },
      {
        "n": 23,
        "title": "Decimals, coordinates and circles",
        "points": [
          "All four operations with decimals",
          "Plotting points on a grid",
          "Circumference and area of circles",
          "Circle graphs and chance with two events"
        ]
      },
      {
        "n": 24,
        "title": "Equations, linear patterns and volume",
        "points": [
          "Solving two-step equations",
          "Patterns shown as straight-line graphs",
          "Volume of prisms and cylinders, and moving shapes on a grid",
          "Sales tax, tips and sale prices"
        ]
      },
      {
        "n": 25,
        "title": "Squares, expressions and proportions",
        "points": [
          "Squares, cubes and prime factors",
          "Writing expressions and solving equations with negative numbers",
          "Rates, ratios and proportions",
          "Views and nets of 3D objects"
        ]
      },
      {
        "n": 26,
        "title": "Roots, right triangles and fractions",
        "points": [
          "Square and cube roots",
          "Right triangles and the Pythagorean theorem",
          "Adding, subtracting, multiplying and dividing fractions",
          "Tricky percents and percent change"
        ]
      },
      {
        "n": 27,
        "title": "Graphs, surface area and best buys",
        "points": [
          "Graphing straight-line relations",
          "Surface area and volume",
          "Mean, median and mode",
          "Probability of two events and finding the best buy"
        ]
      },
      {
        "n": 28,
        "title": "Exponents, rational numbers and scale",
        "points": [
          "Powers and exponent laws",
          "Calculating with positive and negative fractions and decimals",
          "Scale drawings and similar shapes"
        ]
      },
      {
        "n": 29,
        "title": "Polynomials and statistics",
        "points": [
          "Working with polynomials and algebra tiles",
          "Fair samples and biased questions",
          "Spotting misleading graphs and statistics"
        ]
      },
      {
        "n": 30,
        "title": "Linear graphs, equations and budgets",
        "points": [
          "Graphing lines and reading between points",
          "Solving multi-step equations, including brackets",
          "Budgets, bank records and simple interest"
        ]
      }
    ]
  }
];
