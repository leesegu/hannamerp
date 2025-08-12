
import React, { useState, useEffect } from "react";
import type { ApexOptions } from "apexcharts";

const CardsWithAmount: React.FC = () => {
  // Chart
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series = [
    {
      name: "Projects",
      data: [1870, 2000, 1490, 1410, 1680],
    },
  ];

  const options: ApexOptions = {
    chart: {
      toolbar: {
        show: false,
      },
    },
    colors: ["#605DFF"],
    plotOptions: {
      bar: {
        horizontal: true,
      },
    },
    grid: {
      show: true,
      borderColor: "#ECEEF2",
    },
    dataLabels: {
      enabled: true,
      style: {
        fontSize: "11px",
        fontWeight: "normal",
      },
    },
    fill: {
      opacity: 1,
    },
    xaxis: {
      categories: [
        "Rewards Card",
        "Cashback Card",
        "Travel Card",
        "Student Card",
        "Business Card",
      ],
      axisTicks: {
        show: true,
        color: "#ECEEF2",
      },
      axisBorder: {
        show: true,
        color: "#ECEEF2",
      },
      labels: {
        show: true,
        style: {
          colors: "#64748B",
          fontSize: "11px",
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: "#64748B",
          fontSize: "11px",
        },
      },
      axisBorder: {
        show: true,
        color: "#ECEEF2",
      },
      axisTicks: {
        show: true,
        color: "#ECEEF2",
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Cards With Amount</h5>
          </div>
        </div>

        <div className="trezo-card-content">
          <div className="-mt-[25px] -mb-[22px] ltr:-ml-[10px] rtl:-mr-[10px]">
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="bar"
                height={210}
                width={"100%"}
              />
            ) : (
              <div>Loading chart...</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CardsWithAmount;
